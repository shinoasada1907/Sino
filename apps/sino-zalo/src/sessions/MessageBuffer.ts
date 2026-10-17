import type { ZaloMessage } from "../gateway/ZaloGateway.ts";

export interface MessageBufferOptions {
  readonly maxMessages?: number;
  /** How long a message stays after it came in. */
  readonly maxAgeMs?: number;
  readonly now?: () => number;
}

interface Entry {
  readonly id: bigint;
  readonly message: ZaloMessage;
  readonly addedAt: number;
}

const MSG_ID = /^\d+$/;

/**
 * The messages of one account waiting for sino-api to pull them, in msgId order (D-277).
 * msgId is compared as a BigInt: as text "1000" would sort before "999".
 */
export class MessageBuffer {
  private entries: Entry[] = [];
  private readonly ids = new Set<string>();
  private readonly maxMessages: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;

  constructor(options: MessageBufferOptions = {}) {
    this.maxMessages = options.maxMessages ?? 1_000;
    this.maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60_000;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    this.forgetOld();
    return this.entries.length;
  }

  /** Adds the messages not held yet and returns them. */
  add(messages: readonly ZaloMessage[]): ZaloMessage[] {
    const added: ZaloMessage[] = [];
    const addedAt = this.now();
    for (const message of messages) {
      if (!MSG_ID.test(message.msgId) || this.ids.has(message.msgId)) {
        continue;
      }
      const entry = { id: BigInt(message.msgId), message, addedAt };
      this.entries.splice(this.indexAfter(entry.id - 1n), 0, entry);
      this.ids.add(message.msgId);
      added.push(message);
    }
    this.forgetOld();
    while (this.entries.length > this.maxMessages) {
      const dropped = this.entries.shift();
      if (dropped) this.ids.delete(dropped.message.msgId);
    }
    return added;
  }

  has(msgId: string): boolean {
    return this.ids.has(msgId);
  }

  oldest(): bigint | null {
    this.forgetOld();
    return this.entries[0]?.id ?? null;
  }

  /** Up to `limit` messages with a msgId above `after` (all of them without `after`). */
  after(after: bigint | null, limit: number): { messages: ZaloMessage[]; hasMore: boolean } {
    this.forgetOld();
    const start = after === null ? 0 : this.indexAfter(after);
    const messages = this.entries.slice(start, start + limit).map((entry) => entry.message);
    return { messages, hasMore: start + limit < this.entries.length };
  }

  /** The messages held that pass the test, in msgId order. */
  filter(test: (message: ZaloMessage) => boolean): ZaloMessage[] {
    this.forgetOld();
    return this.entries.map((entry) => entry.message).filter(test);
  }

  /** The first index whose msgId is above `id` (binary search). */
  private indexAfter(id: bigint): number {
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.entries[middle] as Entry).id <= id) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  private forgetOld(): void {
    const oldest = this.now() - this.maxAgeMs;
    if (this.entries.every((entry) => entry.addedAt >= oldest)) {
      return;
    }
    this.entries = this.entries.filter((entry) => {
      const keep = entry.addedAt >= oldest;
      if (!keep) this.ids.delete(entry.message.msgId);
      return keep;
    });
  }
}
