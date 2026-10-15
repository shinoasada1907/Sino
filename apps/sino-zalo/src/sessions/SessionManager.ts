import { createHash } from "node:crypto";
import {
  SessionRejectedError,
  type ZaloConnection,
  type ZaloGateway,
  type ZaloListener,
  type ZaloSession,
} from "../gateway/ZaloGateway.ts";
import type { Notifier } from "../notify.ts";

/** sino-zalo holds no session for the account, for instance just after a restart (404). */
export class UnknownAccountError extends Error {}

/** The account's session was kicked or refused; only a different session brings it back (410). */
export class SessionEndedError extends Error {}

export interface SessionManagerOptions {
  readonly log: {
    info(details: object, message: string): void;
    warn(details: object, message: string): void;
  };
}

interface LiveSession {
  readonly state: "LIVE";
  readonly fingerprint: string;
  readonly ownId: string;
  readonly listener: ZaloListener;
  /** Closes since the listener last connected; sets the next reconnect delay. */
  failures: number;
  retry: ReturnType<typeof setTimeout> | null;
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

/** One Zalo session and one listener per account, in memory only (D-274, D-276, D-289). */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  /** The last task queued per account: puts and removes of one account run one after another. */
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly gateway: ZaloGateway;
  private readonly notifier: Notifier;
  private readonly log: SessionManagerOptions["log"];

  constructor(
    gateway: ZaloGateway,
    notifier: Notifier,
    options: SessionManagerOptions,
  ) {
    this.gateway = gateway;
    this.notifier = notifier;
    this.log = options.log;
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

  /** Stops the listener and forgets the account. */
  remove(accountId: string): Promise<void> {
    return this.serial(accountId, async () => {
      this.stop(this.sessions.get(accountId));
      this.sessions.delete(accountId);
    });
  }

  /** The live session of an account; throws UnknownAccountError (404) or SessionEndedError (410). */
  requireLive(accountId: string): { ownId: string } {
    const session = this.sessions.get(accountId);
    if (session === undefined) {
      throw new UnknownAccountError("No session for this account");
    }
    if (session.state === "ENDED") {
      throw new SessionEndedError("The Zalo session has ended");
    }
    return { ownId: session.ownId };
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

  private listen(
    accountId: string,
    fingerprint: string,
    connection: ZaloConnection,
  ): LiveSession {
    const session: LiveSession = {
      state: "LIVE",
      fingerprint,
      ownId: connection.ownId,
      listener: connection.listener({
        connected: () => {
          session.failures = 0;
          this.log.info({ accountId }, "Zalo listener connected");
        },
        closed: (code) => this.closed(accountId, session, code),
        error: (reason) => this.log.warn({ accountId, reason }, "Zalo listener error"),
      }),
      failures: 0,
      retry: null,
    };
    session.listener.start();
    return session;
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
