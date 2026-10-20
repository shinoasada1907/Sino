import { pictureOf } from './sticker'
import type { MessageImage } from './inbox.types'

/**
 * Keeps the picture of a Zalo photo when the page may load it: the addresses pass `pictureOf` (https, no user info),
 * a safe thumbnail stands in for a picture the page refuses, and a thumbnail that is the picture itself is dropped.
 * Null when no address is usable; the message then shows its placeholder text (ZL-16).
 */
export function photoOf(image: MessageImage | null | undefined): MessageImage | null {
  if (!image) {
    return null
  }
  const thumb = pictureOf(image.thumbUrl)
  const url = pictureOf(image.url) ?? thumb
  if (url === null) {
    return null
  }
  return { url, thumbUrl: thumb === url ? null : thumb, caption: image.caption?.trim() || null }
}
