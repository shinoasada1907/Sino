import type { StickerItem } from '@/features/stickers/stickers.types'

/** `StickerResponse` as `GET /api/stickers` gives it (custom-stickers, D-334): newest first, no bytes. */
export function sticker(overrides: Partial<StickerItem> & { id: string }): StickerItem {
  return {
    name: 'Sticker',
    mediaType: 'image/png',
    kind: 'STATIC',
    width: 256,
    height: 256,
    sizeBytes: 4096,
    createdAt: '2026-10-19T08:00:00Z',
    ...overrides,
  }
}

/** A cat that does not move and a dance that does, the newer one first. */
export const API_STICKERS: StickerItem[] = [
  sticker({ id: 'st-dance', name: 'nhay', mediaType: 'image/gif', kind: 'ANIMATED', width: 320, height: 240, sizeBytes: 90_000, createdAt: '2026-10-19T09:00:00Z' }),
  sticker({ id: 'st-cat', name: 'meo', createdAt: '2026-10-19T08:00:00Z' }),
]
