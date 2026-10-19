import type { ZaloConnection, ZaloMessage, ZaloStickerArt } from "../gateway/ZaloGateway.ts";

export interface StickersOptions {
  readonly accountId: string;
  readonly log: {
    warn(details: object, message: string): void;
    info(details: object, message: string): void;
  };
  /** How long to wait for Zalo in one call of `fill`. */
  readonly timeoutMs?: number;
}

/**
 * Gives the sticker messages of a page their still picture and, when the sticker moves, its sprite sheet,
 * asking Zalo once per sticker (D-279). A picture is a nicety: Zalo that does not answer in time, errs, or
 * does not know the sticker leaves the message without one, and nothing is remembered about that, so the
 * next page asks again.
 */
export class Stickers {
  private readonly arts = new Map<string, ZaloStickerArt>();
  private readonly connection: Pick<ZaloConnection, "stickerArt">;
  private readonly accountId: string;
  private readonly log: StickersOptions["log"];
  private readonly timeoutMs: number;

  constructor(connection: Pick<ZaloConnection, "stickerArt">, options: StickersOptions) {
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
          // A picture the message already carries (a gif) is still: it has no sprite sheet.
          this.arts.set(message.sticker.id, { url: message.sticker.url, sprite: null });
        } else if (!this.arts.has(message.sticker.id)) {
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
      const art = this.arts.get(sticker.id);
      return { ...message, sticker: { ...sticker, url: art?.url ?? sticker.url ?? null, sprite: art?.sprite ?? null } };
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
      const art = await this.connection.stickerArt(id);
      if (art !== null) {
        this.arts.set(id, art);
        if (art.sprite !== null) {
          // What Zalo gave, to check the unit of the duration on the first real stickers (ZL-15). Numbers only.
          this.log.info(
            { accountId: this.accountId, stickerId: id, frames: art.sprite.frames, durationMs: art.sprite.durationMs },
            "Zalo gave an animated sticker",
          );
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
      this.log.warn({ accountId: this.accountId, stickerId: id, reason }, "Zalo did not give the sticker");
    }
  }
}
