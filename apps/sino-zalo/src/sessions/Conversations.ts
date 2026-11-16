import type {
  ThreadInfo,
  ThreadType,
  ZaloConnection,
  ZaloMessage,
} from "../gateway/ZaloGateway.ts";

/** A sender of a page of messages; `avatarUrl` is null when Zalo gave no picture, was not asked, or it is the account itself. */
export interface ZaloParticipant {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string | null;
}

/** A conversation in the shape sino-zalo hands to sino-api (design, Contract API). */
export interface ZaloConversation {
  readonly threadId: string;
  readonly threadType: ThreadType;
  /** null when Zalo gave no name and the messages carry none. */
  readonly title: string | null;
  readonly avatarUrl: string | null;
  /** The senders of the messages given with it. */
  readonly participants: readonly ZaloParticipant[];
}

export interface ConversationsOptions {
  readonly accountId: string;
  readonly log: { warn(details: object, message: string): void };
  readonly now?: () => number;
  readonly infoTimeoutMs?: number;
}

const INFO_TTL_MS = 60 * 60_000;
const AVATAR_TTL_MS = 24 * 60 * 60_000;
const UNNAMED: ThreadInfo = { title: null, avatarUrl: null };

interface Thread {
  readonly threadId: string;
  readonly threadType: ThreadType;
  readonly participants: Map<string, string>;
}

/**
 * Names the conversations of a page of messages through Zalo, asking at most once an hour per thread (D-279), and
 * gives each sender a picture: the friend of a 1-1 thread has the thread's, the senders of groups are asked for in one
 * call per page and remembered 24 hours (D-409).
 */
export class Conversations {
  private readonly cache = new Map<string, { info: ThreadInfo; until: number }>();
  /** The picture of each sender seen in a group; null is remembered too, so no picture means no new question. */
  private readonly avatars = new Map<string, { avatarUrl: string | null; until: number }>();
  private readonly connection: Pick<ZaloConnection, "ownId" | "threadInfo" | "userAvatars">;
  private readonly accountId: string;
  private readonly log: ConversationsOptions["log"];
  private readonly now: () => number;
  private readonly infoTimeoutMs: number;

  constructor(connection: Pick<ZaloConnection, "ownId" | "threadInfo" | "userAvatars">, options: ConversationsOptions) {
    this.connection = connection;
    this.accountId = options.accountId;
    this.log = options.log;
    this.now = options.now ?? Date.now;
    this.infoTimeoutMs = options.infoTimeoutMs ?? 2_000;
  }

  async of(messages: readonly ZaloMessage[]): Promise<ZaloConversation[]> {
    const threads = new Map<string, Thread>();
    for (const message of messages) {
      const key = `${message.threadType}:${message.threadId}`;
      let thread = threads.get(key);
      if (thread === undefined) {
        thread = { threadId: message.threadId, threadType: message.threadType, participants: new Map() };
        threads.set(key, thread);
      }
      if (!thread.participants.has(message.fromId)) {
        thread.participants.set(message.fromId, message.fromName);
      }
    }

    const all = [...threads.values()];
    // The lookup of the senders runs beside the thread names, under the same time limit.
    const [named] = await Promise.all([
      Promise.all(all.map(async (thread) => ({ thread, info: await this.info(thread) }))),
      this.learnAvatars(this.unknownSenders(all)),
    ]);
    return named.map(({ thread, info }) => {
      // A 1-1 thread is named after the friend, whose id is the thread id.
      const fallback =
        thread.threadType === "USER" ? (thread.participants.get(thread.threadId) ?? null) : null;
      return {
        threadId: thread.threadId,
        threadType: thread.threadType,
        title: info.title ?? fallback,
        avatarUrl: info.avatarUrl,
        participants: [...thread.participants].map(([id, name]) => ({
          id,
          name,
          avatarUrl: this.avatarOf(thread, id, info),
        })),
      };
    });
  }

  private avatarOf(thread: Thread, senderId: string, info: ThreadInfo): string | null {
    if (senderId === this.connection.ownId) {
      return null;
    }
    if (thread.threadType === "USER") {
      return senderId === thread.threadId ? info.avatarUrl : null;
    }
    return this.knownAvatar(senderId) ?? null;
  }

  /** What is remembered of a sender's picture: a web address, null for none, undefined when not asked (lately). */
  private knownAvatar(senderId: string): string | null | undefined {
    const known = this.avatars.get(senderId);
    return known !== undefined && known.until > this.now() ? known.avatarUrl : undefined;
  }

  /** The senders in groups, not the account itself, whose picture is not remembered; each once. */
  private unknownSenders(threads: readonly Thread[]): string[] {
    const unknown = new Set<string>();
    for (const thread of threads) {
      if (thread.threadType !== "GROUP") {
        continue;
      }
      for (const senderId of thread.participants.keys()) {
        if (senderId !== this.connection.ownId && this.knownAvatar(senderId) === undefined) {
          unknown.add(senderId);
        }
      }
    }
    return [...unknown];
  }

  /** One Zalo call for all of `senderIds`. A failure is not remembered: those senders have no picture on this page only. */
  private async learnAvatars(senderIds: readonly string[]): Promise<void> {
    if (senderIds.length === 0) {
      return;
    }
    try {
      const found = await this.withinTime(this.connection.userAvatars(senderIds));
      const until = this.now() + AVATAR_TTL_MS;
      for (const senderId of senderIds) {
        this.avatars.set(senderId, { avatarUrl: found.get(senderId) ?? null, until });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      // No names and no addresses: a picture address opens the picture.
      this.log.warn(
        { accountId: this.accountId, senders: senderIds.length, reason },
        "Zalo did not give the pictures of the senders",
      );
    }
  }

  /** `work`, or a rejection after `infoTimeoutMs`: a name or a picture is a nicety, and a Zalo that never answers must not hold the messages back. */
  private async withinTime<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeUp = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("No answer in time")), this.infoTimeoutMs);
    });
    try {
      return await Promise.race([work, timeUp]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async info(thread: Thread): Promise<ThreadInfo> {
    const key = `${thread.threadType}:${thread.threadId}`;
    const cached = this.cache.get(key);
    if (cached !== undefined && cached.until > this.now()) {
      return cached.info;
    }
    try {
      const info = await this.withinTime(this.connection.threadInfo(thread.threadId, thread.threadType));
      this.cache.set(key, { info, until: this.now() + INFO_TTL_MS });
      return info;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      this.log.warn(
        { accountId: this.accountId, threadId: thread.threadId, reason },
        "Zalo did not name the thread",
      );
      return UNNAMED;
    }
  }
}
