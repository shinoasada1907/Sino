import { createHash } from "node:crypto";
import {
  SessionRejectedError,
  type ThreadType,
  type ZaloConnection,
  type ZaloGateway,
  type ZaloListener,
  type ZaloMessage,
  type ZaloSession,
} from "../gateway/ZaloGateway.ts";
import type { Notifier } from "../notify.ts";
import { catchUp } from "./CatchUp.ts";
import { Conversations, type ZaloConversation } from "./Conversations.ts";
import { MessageBuffer } from "./MessageBuffer.ts";
import { Stickers } from "./Stickers.ts";

/** sino-zalo holds no session for the account, for instance just after a restart (404). */
export class UnknownAccountError extends Error {}

/** The account's session was kicked or refused; only a different session brings it back (410). */
export class SessionEndedError extends Error {}

export interface SessionManagerOptions {
  readonly log: {
    info(details: object, message: string): void;
    warn(details: object, message: string): void;
  };
  readonly catchUpTimeoutMs?: number;
  readonly now?: () => number;
}

/** What a live session can tell about a message the account may have sent (D-280). */
export interface OwnMessages {
  /** The account's own messages in the thread with the text, sent after the given time. */
  readonly msgIds: string[];
  /** When the session started: the buffer knows nothing from before. */
  readonly liveSince: number;
}

/** One answer of `GET /accounts/{accountId}/messages` (design, Contract API). */
export interface MessagePage {
  readonly conversations: ZaloConversation[];
  readonly messages: ZaloMessage[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

interface LiveSession {
  readonly state: "LIVE";
  readonly fingerprint: string;
  readonly ownId: string;
  readonly connection: ZaloConnection;
  readonly liveSince: number;
  readonly listener: ZaloListener;
  readonly buffer: MessageBuffer;
  readonly conversations: Conversations;
  readonly stickers: Stickers;
  /** Closes since the listener last connected; sets the next reconnect delay. */
  failures: number;
  retry: ReturnType<typeof setTimeout> | null;
  /** Whether Zalo's messages can be read, so old messages may be asked for. */
  ready: boolean;
  readonly whenReady: (() => void)[];
  /** The catch-up waiting for a page of each thread type. */
  readonly pages: Map<ThreadType, (messages: ZaloMessage[]) => void>;
  /** The lowest cursor this session has caught up from (D-278). */
  caughtUpFrom: bigint | null;
  catchingUp: Promise<void> | null;
}

interface EndedSession {
  readonly state: "ENDED";
  readonly fingerprint: string;
}

type Session = LiveSession | EndedSession;

/** Close codes after which Zalo has ended the session: another web connection (3000) or a kick (3003). */
const KICK_CODES = new Set([3000, 3003]);
const RETRY_FIRST_MS = 1_000;
const RETRY_MAX_MS = 60_000;

/** One Zalo session, listener and message buffer per account, in memory only (D-274, D-276, D-277, D-289). */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  /** The last task queued per account: puts and removes of one account run one after another. */
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly gateway: ZaloGateway;
  private readonly notifier: Notifier;
  private readonly log: SessionManagerOptions["log"];
  private readonly catchUpTimeoutMs: number;
  private readonly now: () => number;

  constructor(
    gateway: ZaloGateway,
    notifier: Notifier,
    options: SessionManagerOptions,
  ) {
    this.gateway = gateway;
    this.notifier = notifier;
    this.log = options.log;
    this.catchUpTimeoutMs = options.catchUpTimeoutMs ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Makes sure the account runs on this session, as D-289 lays out. Throws SessionEndedError
   * when the session is known to be dead or Zalo refuses it, ZaloUnavailableError when Zalo does not answer.
   */
  put(accountId: string, session: ZaloSession): Promise<void> {
    return this.serial(accountId, async () => {
      const fingerprint = fingerprintOf(session);
      const current = this.sessions.get(accountId);
      if (current?.fingerprint === fingerprint) {
        if (current.state === "ENDED") {
          throw new SessionEndedError("The Zalo session has ended");
        }
        return;
      }

      let connection: ZaloConnection;
      try {
        connection = await this.gateway.loginWithSession(session);
      } catch (error) {
        if (!(error instanceof SessionRejectedError)) {
          this.log.warn({ accountId, reason: reasonOf(error) }, "Zalo did not answer the session login");
          throw error;
        }
        this.stop(current);
        this.sessions.set(accountId, { state: "ENDED", fingerprint });
        this.log.warn({ accountId }, "Zalo refused the session");
        throw new SessionEndedError("Zalo refused the session");
      }

      this.stop(current);
      this.sessions.set(accountId, this.listen(accountId, fingerprint, connection));
      this.log.info({ accountId, ownId: connection.ownId }, "Zalo session started");
    });
  }

  /** Stops the listener and forgets the account with its buffer. */
  remove(accountId: string): Promise<void> {
    return this.serial(accountId, async () => {
      this.stop(this.sessions.get(accountId));
      this.sessions.delete(accountId);
    });
  }

  /** The live session of an account; throws UnknownAccountError (404) or SessionEndedError (410). */
  requireLive(accountId: string): { ownId: string } {
    return { ownId: this.liveSession(accountId).ownId };
  }

  /**
   * Up to `limit` buffered messages after the cursor, with their conversations. A cursor older than
   * the buffer first brings in what Zalo kept since then (D-278).
   */
  async readMessages(accountId: string, after: string | null, limit: number): Promise<MessagePage> {
    const session = this.liveSession(accountId);
    const cursor = after === null ? null : BigInt(after);
    if (cursor !== null) {
      await this.catchUpIfNeeded(accountId, session, cursor);
    }
    const { messages, hasMore } = session.buffer.after(cursor, limit);
    return {
      conversations: await session.conversations.of(messages),
      messages: await session.stickers.fill(messages),
      nextCursor: messages.at(-1)?.msgId ?? after,
      hasMore,
    };
  }

  /** Sends a text through the account's live session and resolves with Zalo's msgId. */
  sendText(accountId: string, threadId: string, threadType: ThreadType, text: string): Promise<string> {
    return this.liveSession(accountId).connection.sendText(threadId, threadType, text);
  }

  /** The account's own messages in a thread with this text, sent after `after` (epoch ms). */
  ownMessages(accountId: string, threadId: string, text: string, after: number): OwnMessages {
    const session = this.liveSession(accountId);
    const messages = session.buffer.filter(
      (message) =>
        message.isSelf &&
        message.threadId === threadId &&
        message.text === text &&
        Date.parse(message.sentAt) > after,
    );
    return { msgIds: messages.map((message) => message.msgId), liveSince: session.liveSince };
  }

  counts(): { live: number; ended: number } {
    let live = 0;
    for (const session of this.sessions.values()) {
      if (session.state === "LIVE") live++;
    }
    return { live, ended: this.sessions.size - live };
  }

  /** On shutdown: stops every listener. */
  stopAll(): void {
    for (const session of this.sessions.values()) {
      this.stop(session);
    }
    this.sessions.clear();
  }

  private liveSession(accountId: string): LiveSession {
    const session = this.sessions.get(accountId);
    if (session === undefined) {
      throw new UnknownAccountError("No session for this account");
    }
    if (session.state === "ENDED") {
      throw new SessionEndedError("The Zalo session has ended");
    }
    return session;
  }

  private listen(
    accountId: string,
    fingerprint: string,
    connection: ZaloConnection,
  ): LiveSession {
    const session: LiveSession = {
      state: "LIVE",
      fingerprint,
      ownId: connection.ownId,
      connection,
      liveSince: this.now(),
      listener: connection.listener({
        connected: () => {
          session.failures = 0;
          this.log.info({ accountId }, "Zalo listener connected");
        },
        ready: () => {
          session.ready = true;
          for (const resolve of session.whenReady.splice(0)) resolve();
        },
        message: (message) => this.received(accountId, session, message),
        oldMessages: (messages, threadType) => {
          const resolve = session.pages.get(threadType);
          session.pages.delete(threadType);
          resolve?.(messages);
        },
        closed: (code) => {
          session.ready = false;
          this.closed(accountId, session, code);
        },
        error: (reason) => this.log.warn({ accountId, reason }, "Zalo listener error"),
      }),
      buffer: new MessageBuffer(),
      conversations: new Conversations(connection, { accountId, log: this.log }),
      stickers: new Stickers(connection, { accountId, log: this.log }),
      failures: 0,
      retry: null,
      ready: false,
      whenReady: [],
      pages: new Map(),
      caughtUpFrom: null,
      catchingUp: null,
    };
    session.listener.start();
    return session;
  }

  private received(accountId: string, session: LiveSession, message: ZaloMessage): void {
    if (this.sessions.get(accountId) !== session) {
      return;
    }
    // IDs, type and length only: never the text (D-282). For a photo also whether a picture was found, never its
    // address (it opens the picture) or its caption. For a sticker its ids, which are numbers. When the pipeline could
    // not show the message as it means to (no picture, no sticker, a type nobody has handled): the keys of the content
    // with the kind of each value, never a value, so a message that shows nowhere can be told apart: not understood
    // here, or lost later (ZL-16).
    this.log.info(
      {
        accountId,
        msgId: message.msgId,
        threadId: message.threadId,
        zaloType: message.zaloType,
        length: message.text?.length ?? 0,
        ...(message.zaloType === "chat.photo" ? { photo: message.photo !== undefined } : {}),
        ...(message.zaloType === "chat.sticker" && message.sticker !== undefined
          ? { stickerId: message.sticker.id, stickerCatId: message.sticker.catId, stickerType: message.sticker.type }
          : {}),
        ...(message.contentShape === undefined ? {} : { contentShape: message.contentShape }),
      },
      "Zalo message",
    );
    // Into the buffer first: whatever happens to the webhook, sino-api finds the message at its next pull.
    if (session.buffer.add([message]).length > 0) {
      this.notifier.messagesArrived(session.ownId);
    }
  }

  private async catchUpIfNeeded(accountId: string, session: LiveSession, cursor: bigint): Promise<void> {
    while (session.catchingUp !== null) {
      await session.catchingUp;
    }
    if (session.caughtUpFrom !== null && session.caughtUpFrom <= cursor) {
      return;
    }
    const oldest = session.buffer.oldest();
    if (oldest !== null && cursor >= oldest) {
      return;
    }
    session.caughtUpFrom = cursor;
    const run = async () => {
      const reports = await catchUp(
        (threadType, lastId) => this.requestPage(session, threadType, lastId),
        session.buffer,
        cursor.toString(),
        { timeoutMs: this.catchUpTimeoutMs },
      );
      for (const report of reports) {
        if (!report.joined) {
          this.log.warn(
            { accountId, threadType: report.threadType, pages: report.pages, messages: report.messages },
            "Catch-up stopped before it joined the buffer",
          );
        }
      }
    };
    session.catchingUp = run().finally(() => {
      session.catchingUp = null;
    });
    await session.catchingUp;
  }

  private async requestPage(
    session: LiveSession,
    threadType: ThreadType,
    lastId: string,
  ): Promise<ZaloMessage[]> {
    if (!session.ready) {
      // Bounded like the catch-up, so a catch-up that gave up never asks Zalo later.
      const ready = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), this.catchUpTimeoutMs);
        session.whenReady.push(() => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      if (!ready) {
        throw new Error("The Zalo listener is not ready");
      }
    }
    const page = new Promise<ZaloMessage[]>((resolve) => session.pages.set(threadType, resolve));
    session.listener.requestOldMessages(threadType, lastId);
    return page;
  }

  private closed(accountId: string, session: LiveSession, code: number): void {
    // A listener that was stopped, replaced or kicked still reports its close: ignore it.
    if (this.sessions.get(accountId) !== session) {
      return;
    }
    if (KICK_CODES.has(code)) {
      this.stop(session);
      this.sessions.set(accountId, { state: "ENDED", fingerprint: session.fingerprint });
      this.log.warn({ accountId, code }, "Zalo ended the session");
      void this.notifier.sessionEnded(session.ownId);
      return;
    }
    const delayMs = Math.min(RETRY_FIRST_MS * 2 ** session.failures, RETRY_MAX_MS);
    session.failures++;
    this.log.warn({ accountId, code, delayMs }, "Zalo listener closed, reconnecting");
    session.retry = setTimeout(() => {
      session.retry = null;
      session.listener.start();
    }, delayMs);
  }

  private stop(session: Session | undefined): void {
    if (session?.state !== "LIVE") {
      return;
    }
    if (session.retry !== null) {
      clearTimeout(session.retry);
      session.retry = null;
    }
    session.listener.stop();
  }

  private serial<T>(accountId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(accountId) ?? Promise.resolve();
    const result = previous.then(task, task);
    const settled = result.catch(() => undefined);
    this.queues.set(accountId, settled);
    void settled.then(() => {
      if (this.queues.get(accountId) === settled) {
        this.queues.delete(accountId);
      }
    });
    return result;
  }
}

/** SHA-256 of the session as sino-api sent it; kept in memory only, never logged (D-289). */
function fingerprintOf(session: ZaloSession): string {
  return createHash("sha256").update(JSON.stringify(session), "utf8").digest("hex");
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
