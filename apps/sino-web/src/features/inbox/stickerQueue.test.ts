import { describe, expect, it } from 'vitest'
import { STICKER_GAP_MS, StickerTurns } from './stickerQueue'

// sino-zalo takes one message a second per account (D-280). Stickers go one at a time (D-355), but a sticker that took
// 300 ms to send would let the next one go at once and be refused, so a sticker also waits until `gapMs` after the start
// of the one before.
describe('the turns of the stickers on their way', () => {
  function turns(gapMs: number) {
    let clock = 10_000
    const slept: number[] = []
    const queue = new StickerTurns({
      gapMs,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms)
        clock += ms
      },
    })
    return { queue, slept, advance: (ms: number) => (clock += ms), at: () => clock }
  }

  it('lets the first sticker go at once', async () => {
    const { queue, slept } = turns(1_100)

    await queue.wait()

    expect(slept).toEqual([])
  })

  it('makes the next sticker wait for what is left of the gap after the start of the one before', async () => {
    const { queue, slept, advance } = turns(1_100)
    await queue.wait()
    advance(300)

    await queue.wait()

    expect(slept).toEqual([800])
  })

  it('does not wait when the gap has passed already', async () => {
    const { queue, slept, advance } = turns(1_100)
    await queue.wait()
    advance(5_000)

    await queue.wait()

    expect(slept).toEqual([])
  })

  it('counts the gap from the start of the one before, not from its end, and keeps counting for the third', async () => {
    const { queue, slept, advance, at } = turns(1_000)
    await queue.wait()
    const first = at()
    advance(100)
    await queue.wait()
    const second = at()
    advance(100)
    await queue.wait()

    expect(second - first).toBe(1_000)
    expect(at() - second).toBe(1_000)
    expect(slept).toEqual([900, 900])
  })

  it('keeps a gap of just over a second, since sino-zalo takes a message a second', () => {
    expect(STICKER_GAP_MS).toBeGreaterThan(1_000)
  })
})
