import { api } from '@/shared/api/client'
import type { StickerChange, StickerItem, StickerPack } from './stickers.types'

// The requests of the Sticker screen, on the custom-stickers API (D-334) and the sticker-packs API (D-344). A refusal is an
// `ApiError` whose `code` is one of `STICKER_*` (too large, type unsupported, duplicate, limit reached, no such pack…).

/** `GET /api/stickers`: the stickers of the owner, newest first, without their bytes. */
export async function fetchStickers(): Promise<StickerItem[]> {
  return (await api.get<{ items: StickerItem[] }>('/api/stickers')).items
}

/**
 * `POST /api/stickers`, a form with the file and, when there is one, the name; without a name the server names the sticker
 * by its file. With a `packId` the sticker goes into that pack; without one (or `null`) it is in no pack. The browser
 * writes the type of the form and the name of the file itself.
 */
export function uploadSticker(file: File, name?: string, packId?: string | null): Promise<StickerItem> {
  const form = new FormData()
  form.append('file', file)
  if (name !== undefined) {
    form.append('name', name)
  }
  if (packId) {
    form.append('packId', packId)
  }
  return api.upload<StickerItem>('/api/stickers', form)
}

/** `PATCH /api/stickers/{id}`: renames a sticker or moves it; a field left out of `change` is not sent, so it stays. */
export function changeSticker(id: string, change: StickerChange): Promise<StickerItem> {
  return api.patch<StickerItem>(`/api/stickers/${encodeURIComponent(id)}`, change)
}

/** `DELETE /api/stickers/{id}`. */
export async function deleteSticker(id: string): Promise<void> {
  await api.delete(`/api/stickers/${encodeURIComponent(id)}`)
}

/** Where the picture of a sticker is: an `<img src>` on the same origin sends the session cookie, and the server caches it for good (D-335). */
export const stickerContentUrl = (id: string) => `/api/stickers/${encodeURIComponent(id)}/content`

/** `GET /api/sticker-packs`: the packs of the owner, the oldest first, each with how many stickers it holds. */
export async function fetchPacks(): Promise<StickerPack[]> {
  return (await api.get<{ items: StickerPack[] }>('/api/sticker-packs')).items
}

/** `POST /api/sticker-packs`; the server trims the name and refuses one another pack has, whatever its case. */
export function createPack(name: string): Promise<StickerPack> {
  return api.post<StickerPack>('/api/sticker-packs', { name })
}

/** `PATCH /api/sticker-packs/{id}`. */
export function renamePack(id: string, name: string): Promise<StickerPack> {
  return api.patch<StickerPack>(`/api/sticker-packs/${encodeURIComponent(id)}`, { name })
}

/** `DELETE /api/sticker-packs/{id}`; the stickers of the pack stay in the library, in no pack. */
export async function deletePack(id: string): Promise<void> {
  await api.delete(`/api/sticker-packs/${encodeURIComponent(id)}`)
}
