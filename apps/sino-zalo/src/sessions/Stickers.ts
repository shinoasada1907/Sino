import type { ZaloConnection, ZaloMessage } from "../gateway/ZaloGateway.ts";

export interface StickersOptions {
  readonly accountId: string;
  readonly log: { warn(details: object, message: string): void };
  /** How long to wait for Zalo in one call of `fill`. */
  readonly timeoutMs?: number;
}

/**
 * Gives the sticker messages of a page their picture, asking Zalo once per sticker (D-279). A picture is
 * a nicety: Zalo that does not answer in time, errs, or does not know the sticker leaves the message
 * without one, and nothing is remembered about that, so the next page asks again.
 */
export class Stickers {
  private readonly urls = new Map<string, string>();
  private readonly connection: Pick<ZaloConnection, "stickerUrl">;
  private readonly accountId: string;
  private readonly log: StickersOptions["log"];
  private readonly timeoutMs: number;

  constructor(connection: Pick<ZaloConnection, "stickerUrl">, options: StickersOptions) {
    this.connection = connection;
    this.accountId = options.accountId;
    this.log = options.log;
    this.timeoutMs = options.timeoutMs ?? 2_000;
  }

  /** The messages with the sticker pictures known so far; a message is copied, never changed. */
  async fill(messages: readonly ZaloMessage[]): Promise<ZaloMessage[]> {
    const wanted = new Set<string>();
    for (const message of messages) {
      if (message.sticker !== undefined) {
        if (message.sticker.url) {
          this.urls.set(message.sticker.id, message.sticker.url);
        } else if (!this.urls.has(message.sticker.id)) {
          wanted.add(message.sticker.id);
        }
      }
    }
    await this.ask([...wanted]);

    return messages.map((message) => {
      const sticker = message.sticker;
      if (sticker === undefined) {
        return message;
      }
      return { ...message, sticker: { ...sticker, url: this.urls.get(sticker.id) ?? sticker.url ?? null } };
    });
  }

  private async ask(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeUp = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.timeoutMs);
    });
    try {
      // Answers that come after the time is up still land in the cache for the next page.
      await Promise.race([Promise.all(ids.map((id) => this.askOne(id))), timeUp]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async askOne(id: string): Promise<void> {
    try {
      const url = await this.connection.stickerUrl(id);
      if (url !== null) {
        this.urls.set(id, url);
      }
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
      this.log.warn({ accountId: this.accountId, stickerId: id, reason }, "Zalo did not give the sticker");
    }
  }
}
