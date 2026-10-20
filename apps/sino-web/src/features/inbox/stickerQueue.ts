/**
 * How fast stickers go out. sino-zalo takes one message a second per account (D-280). The stickers on their way go one at a
 * time (D-355), but a sticker that took 300 ms to send would let the next one go at once and be refused, so each also waits
 * until a little over a second after the start of the one before it.
 */

/** A little over the second sino-zalo asks for between two messages of one account, in milliseconds. */
export const STICKER_GAP_MS = 1_100

/** What the app waits between two stickers; a test sets it to nothing so that it does not wait. */
export const stickerPacing = { gapMs: STICKER_GAP_MS }

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class StickerTurns {
  readonly #gapMs: number | (() => number)
  readonly #now: () => number
  readonly #sleep: (ms: number) => Promise<void>
  #lastStart = Number.NEGATIVE_INFINITY

  constructor({ gapMs, now = Date.now, sleep = pause }: { gapMs: number | (() => number); now?: () => number; sleep?: (ms: number) => Promise<void> }) {
    this.#gapMs = gapMs
    this.#now = now
    this.#sleep = sleep
  }

  /** Resolves when the next sticker may go: the gap after the start of the one before has passed. Call one at a time. */
  async wait(): Promise<void> {
    const gap = typeof this.#gapMs === 'function' ? this.#gapMs() : this.#gapMs
    const left = this.#lastStart + gap - this.#now()
    if (left > 0) {
      await this.#sleep(left)
    }
    this.#lastStart = this.#now()
  }
}

/** The one queue of the app: the stickers of every conversation share the limit of the account. */
export const stickerTurns = new StickerTurns({ gapMs: () => stickerPacing.gapMs })
