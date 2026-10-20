import type { Instant } from '@/shared/domain'

/** Whether a sticker moves; the server works it out from the file (a GIF with one frame is still `STATIC`). */
export type StickerKind = 'STATIC' | 'ANIMATED'

/** One sticker of the library, as `GET /api/stickers` gives it (custom-stickers, D-334); the picture is at `stickerContentUrl`. */
export interface StickerItem {
  id: string
  name: string
  mediaType: 'image/png' | 'image/gif' | 'image/webp'
  kind: StickerKind
  width: number
  height: number
  sizeBytes: number
  /** The pack the sticker is in, `null` for "Chưa xếp bộ" (sticker-packs, D-344). */
  packId: string | null
  createdAt: Instant
}

/** What `PATCH /api/stickers/{id}` changes: a field left out stays as it is, and `packId: null` takes the sticker out of its pack. */
export interface StickerChange {
  name?: string
  packId?: string | null
}

/**
 * One sticker pack, as `GET /api/sticker-packs` gives it (sticker-packs, D-344): how many stickers it holds and its newest
 * one (`null` when it is empty). Which stickers are in it is told by their `packId`.
 */
export interface StickerPack {
  id: string
  name: string
  stickerCount: number
  coverStickerId: string | null
  createdAt: Instant
}
