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
  createdAt: Instant
}
