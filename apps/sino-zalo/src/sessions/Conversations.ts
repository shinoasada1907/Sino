import type {
  ThreadInfo,
  ThreadType,
  ZaloConnection,
  ZaloMessage,
} from "../gateway/ZaloGateway.ts";

/** A conversation in the shape sino-zalo hands to sino-api (design, Contract API). */
export interface ZaloConversation {
  readonly threadId: string;
  readonly threadType: ThreadType;
  /** null when Zalo gave no name and the messages carry none. */
  readonly title: string | null;
  readonly avatarUrl: string | null;
  /** The senders of the messages given with it. */
  readonly participants: readonly { readonly id: string; readonly name: string }[];
}

export interface ConversationsOptions {
  readonly accountId: string;
  readonly log: { warn(details: object, message: string): void };
  readonly now?: () => number;
  readonly infoTimeoutMs?: number;
}

const INFO_TTL_MS = 60 * 60_000;
const UNNAMED: ThreadInfo = { title: null, avatarUrl: null };

interface Thread {
  readonly threadId: string;
  readonly threadType: ThreadType;
  readonly participants: Map<string, string>;
}

/** Names the conversations of a page of messages through Zalo, asking at most once an hour per thread (D-279). */
export class Conversations {
  private readonly cache = new Map<string, { info: ThreadInfo; until: number }>();
  private readonly connection: Pick<ZaloConnection, "threadInfo">;
  private readonly accountId: string;
  private readonly log: ConversationsOptions["log"];
  private readonly now: () => number;
  private readonly infoTimeoutMs: number;

  constructor(connection: Pick<ZaloConnection, "threadInfo">, options: ConversationsOptions) {
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

    return Promise.all(
      [...threads.values()].map(async (thread) => {
        const info = await this.info(thread);
        // A 1-1 thread is named after the friend, whose id is the thread id.
        const fallback =
          thread.threadType === "USER" ? (thread.participants.get(thread.threadId) ?? null) : null;
        return {
          threadId: thread.threadId,
          threadType: thread.threadType,
          title: info.title ?? fallback,
          avatarUrl: info.avatarUrl,
          participants: [...thread.participants].map(([id, name]) => ({ id, name })),
        };
      }),
    );
  }

  private async info(thread: Thread): Promise<ThreadInfo> {
    const key = `${thread.threadType}:${thread.threadId}`;
    const cached = this.cache.get(key);
    if (cached !== undefined && cached.until > this.now()) {
      return cached.info;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A name is a nicety: a Zalo that never answers must not hold the messages back.
    const timeUp = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("No answer in time")), this.infoTimeoutMs);
    });
    try {
      const info = await Promise.race([
        this.connection.threadInfo(thread.threadId, thread.threadType),
        timeUp,
      ]);
      this.cache.set(key, { info, until: this.now() + INFO_TTL_MS });
      return info;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      this.log.warn(
        { accountId: this.accountId, threadId: thread.threadId, reason },
        "Zalo did not name the thread",
      );
      return UNNAMED;
    } finally {
      clearTimeout(timer);
    }
  }
}
