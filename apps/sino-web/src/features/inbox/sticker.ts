import type { StickerSprite } from './inbox.types'

/** What a sprite sheet may be (ZL-15): the same bounds as the backend, so a value the page plays was checked twice. */
const MIN_FRAMES = 2
const MAX_FRAMES = 300
const MIN_DURATION_MS = 100
const MAX_DURATION_MS = 10_000

/**
 * Keeps an address for a sticker picture when it is safe to load in the browser: https only, no user info, no scripts.
 * Refuses anything else (ZL-14, D-279).
 */
export function pictureOf(address: string | null | undefined): string | null {
  if (!address) {
    return null
  }
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' || url.username || url.password) {
      return null
    }
    return address
  } catch {
    return null
  }
}

/**
 * Keeps the sprite sheet of a moving sticker when the page may play it: an address that passes `pictureOf`, a whole
 * number of frames and a duration within bounds. Otherwise null, and the sticker shows its still picture (ZL-15).
 */
export function spriteOf(sprite: StickerSprite | null | undefined): StickerSprite | null {
  if (!sprite) {
    return null
  }
  const url = pictureOf(sprite.url)
  const { frames, durationMs } = sprite
  if (
    url === null ||
    !Number.isInteger(frames) || frames < MIN_FRAMES || frames > MAX_FRAMES ||
    !Number.isInteger(durationMs) || durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS
  ) {
    return null
  }
  return { url, frames, durationMs }
}
