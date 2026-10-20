import type { StickerItem, StickerPack } from '@/features/stickers/stickers.types'

/** `StickerResponse` as `GET /api/stickers` gives it (custom-stickers, D-334): newest first, no bytes; in no pack unless told. */
export function sticker(overrides: Partial<StickerItem> & { id: string }): StickerItem {
  return {
    name: 'Sticker',
    mediaType: 'image/png',
    kind: 'STATIC',
    width: 256,
    height: 256,
    sizeBytes: 4096,
    packId: null,
    createdAt: '2026-10-19T08:00:00Z',
    ...overrides,
  }
}

/** A cat that does not move and a dance that does, the newer one first. */
export const API_STICKERS: StickerItem[] = [
  sticker({ id: 'st-dance', name: 'nhay', mediaType: 'image/gif', kind: 'ANIMATED', width: 320, height: 240, sizeBytes: 90_000, createdAt: '2026-10-19T09:00:00Z' }),
  sticker({ id: 'st-cat', name: 'meo', createdAt: '2026-10-19T08:00:00Z' }),
]

/** `StickerPackResponse` as `GET /api/sticker-packs` gives it (sticker-packs, D-344): empty unless told. */
export function pack(overrides: Partial<StickerPack> & { id: string; name: string }): StickerPack {
  return { stickerCount: 0, coverStickerId: null, createdAt: '2026-10-20T08:00:00Z', ...overrides }
}

/**
 * A library sorted into packs: `Mèo` holds the cat, `Chó` is empty, and the dance is in no pack. The packs are the
 * oldest first, as the server lists them, and their counts and covers agree with the stickers.
 */
export const PACKED_STICKERS: StickerItem[] = [
  sticker({ id: 'st-dance', name: 'nhay', mediaType: 'image/gif', kind: 'ANIMATED', width: 320, height: 240, sizeBytes: 90_000, createdAt: '2026-10-19T09:00:00Z' }),
  sticker({ id: 'st-cat', name: 'meo', packId: 'pk-cats', createdAt: '2026-10-19T08:00:00Z' }),
]

export const API_PACKS: StickerPack[] = [
  pack({ id: 'pk-cats', name: 'Mèo', stickerCount: 1, coverStickerId: 'st-cat', createdAt: '2026-10-20T08:00:00Z' }),
  pack({ id: 'pk-dogs', name: 'Chó', createdAt: '2026-10-20T09:00:00Z' }),
]
