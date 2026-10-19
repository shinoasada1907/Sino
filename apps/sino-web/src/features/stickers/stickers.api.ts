import { api } from '@/shared/api/client'
import type { StickerItem } from './stickers.types'

// The requests of the Sticker screen, on the custom-stickers API (D-334). A refusal is an `ApiError` whose `code` is one
// of `STICKER_*` (too large, type unsupported, duplicate, limit reached…).

/** `GET /api/stickers`: the stickers of the owner, newest first, without their bytes. */
export async function fetchStickers(): Promise<StickerItem[]> {
  return (await api.get<{ items: StickerItem[] }>('/api/stickers')).items
}

/**
 * `POST /api/stickers`, a form with the file and, when there is one, the name; without a name the server names the sticker
 * by its file. The browser writes the type of the form and the name of the file itself.
 */
export function uploadSticker(file: File, name?: string): Promise<StickerItem> {
  const form = new FormData()
  form.append('file', file)
  if (name !== undefined) {
    form.append('name', name)
  }
  return api.upload<StickerItem>('/api/stickers', form)
}

/** `DELETE /api/stickers/{id}`. */
export async function deleteSticker(id: string): Promise<void> {
  await api.delete(`/api/stickers/${encodeURIComponent(id)}`)
}

/** Where the picture of a sticker is: an `<img src>` on the same origin sends the session cookie, and the server caches it for good (D-335). */
export const stickerContentUrl = (id: string) => `/api/stickers/${encodeURIComponent(id)}/content`
