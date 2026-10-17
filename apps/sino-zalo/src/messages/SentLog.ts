import { ZaloRejectedError } from "../gateway/ZaloGateway.ts";

export interface SentRecord {
  readonly msgId: string;
  readonly sentAt: string;
}

/** What sino-zalo knows about a send: on its way, gone out, or broken midway so nobody knows. */
export type SentState =
  | { readonly state: "PENDING" }
  | { readonly state: "SENT"; readonly record: SentRecord }
  | { readonly state: "UNKNOWN" };

export interface SentLogOptions {
  readonly ttlMs?: number;
  readonly now?: () => number;
}

interface Entry {
  readonly expiresAt: number;
  state: SentState;
}

/**
 * The sends of the last 24 hours by clientMessageId, so that the same id never goes out twice (D-280).
 * In memory only: after a restart sino-zalo knows no send, and the lookup says so (409).
 */
export class SentLog {
  /** In the order sends started, which is the order they expire in. */
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: SentLogOptions = {}) {
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60_000;
    this.now = options.now ?? Date.now;
  }

  /** Sends that started before this time may have been forgotten. */
  knowsSince(): number {
    return this.now() - this.ttlMs;
  }

  get(accountId: string, clientMessageId: string): SentState | undefined {
    this.forgetExpired();
    return this.entries.get(keyOf(accountId, clientMessageId))?.state;
  }

  /**
   * Remembers a send from the moment it starts. The msgId is written as soon as Zalo gives it, before
   * the returned promise resolves, so it is held before anyone answers 201, and even when nobody waits anymore.
   */
  track(accountId: string, clientMessageId: string, sending: Promise<string>): Promise<SentRecord> {
    this.forgetExpired();
    const key = keyOf(accountId, clientMessageId);
    const entry: Entry = { expiresAt: this.now() + this.ttlMs, state: { state: "PENDING" } };
    this.entries.set(key, entry);
    return sending.then(
      (msgId) => {
        const record = { msgId, sentAt: new Date(this.now()).toISOString() };
        // On the entry itself: one that expired meanwhile is not brought back.
        entry.state = { state: "SENT", record };
        return record;
      },
      (error: unknown) => {
        if (error instanceof ZaloRejectedError) {
          // Nothing went out, so the same id may be sent again.
          if (this.entries.get(key) === entry) this.entries.delete(key);
        } else {
          entry.state = { state: "UNKNOWN" };
        }
        throw error;
      },
    );
  }

  private forgetExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > now) {
        return;
      }
      this.entries.delete(key);
    }
  }
}

function keyOf(accountId: string, clientMessageId: string): string {
  return JSON.stringify([accountId, clientMessageId]);
}
