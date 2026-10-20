import type { StickerItem, StickerPack } from './stickers.types'

/** One part of the Sticker screen: a pack and its stickers, or (`pack: null`) the stickers in no pack, "Chưa xếp bộ". */
export interface PackPart {
  pack: StickerPack | null
  stickers: StickerItem[]
}

/**
 * The parts of the screen (delta web-sticker-library): one per pack in the order of the packs (the oldest first), even
 * an empty one, then "Chưa xếp bộ" when it holds something. Within a part the stickers keep the order of the list, the
 * newest first. A sticker of a pack missing from `packs` (made in another tab since they were read) is shown in
 * "Chưa xếp bộ" rather than nowhere.
 */
export function groupByPack(stickers: StickerItem[], packs: StickerPack[]): PackPart[] {
  const parts = new Map<string, StickerItem[]>(packs.map((pack) => [pack.id, []]))
  const unsorted: StickerItem[] = []
  for (const item of stickers) {
    const part = item.packId === null ? undefined : parts.get(item.packId)
    if (part) {
      part.push(item)
    } else {
      unsorted.push(item)
    }
  }
  const sorted = packs.map((pack) => ({ pack, stickers: parts.get(pack.id) ?? [] }))
  return unsorted.length > 0 ? [...sorted, { pack: null, stickers: unsorted }] : sorted
}
