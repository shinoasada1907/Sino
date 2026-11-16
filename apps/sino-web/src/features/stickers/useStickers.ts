import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/problem'
import { changeSticker, deleteSticker, fetchStickers, uploadSticker } from './stickers.api'
import type { StickerChange, StickerItem } from './stickers.types'
import { forgetPack, setStickersAndCount, STICKERS_QUERY_KEY } from './stickersCache'

export { STICKERS_QUERY_KEY }

export interface StickersQuery {
  stickers: StickerItem[] | undefined
  /** When the list arrived (milliseconds since the epoch, 0 before any data). */
  receivedAt: number
  /** Why the last load failed; the page shows it only while there is no list. */
  error: Error | null
  retry: () => void
}

/** The library of the owner, newest first. It is read again at each visit of the screen, and shown at once from the last read. */
export function useStickers(): StickersQuery {
  const { data, dataUpdatedAt, error, refetch } = useQuery({ queryKey: STICKERS_QUERY_KEY, queryFn: fetchStickers })
  return { stickers: data, receivedAt: dataUpdatedAt, error, retry: () => void refetch() }
}

// Each change is written into the lists the screen holds (see `stickersCache`): the stickers, then the counts of the packs.

/** A pack the server says is gone: the refusal of an upload into it, or of a move into it, changed nothing else. */
const packGone = (error: Error) => error instanceof ApiError && error.code === 'STICKER_PACK_NOT_FOUND'

/**
 * Uploads one file, into a pack when `packId` is given; the new sticker is first in the list and counted in its pack. A
 * refusal reaches the caller as an `ApiError` and changes nothing, but a pack the server says is gone is forgotten.
 */
export function useUploadSticker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, name, packId }: { file: File; name?: string; packId?: string | null }) => uploadSticker(file, name, packId),
    onSuccess: (made) => setStickersAndCount(queryClient, (list) => [made, ...list.filter((item) => item.id !== made.id)]),
    onError: (error, { packId }) => {
      if (packGone(error) && packId) {
        return forgetPack(queryClient, packId)
      }
    },
  })
}

/**
 * Renames a sticker or moves it (`packId: null` is "Chưa xếp bộ"); the list gets the sticker as the server gives it back.
 * A sticker the server says is gone leaves the list; a pack it says is gone is forgotten, and the sticker stays where it was.
 */
export function useChangeSticker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: StickerChange }) => changeSticker(id, change),
    onSuccess: (changed) => setStickersAndCount(queryClient, (list) => list.map((item) => (item.id === changed.id ? changed : item))),
    onError: (error, { id, change }) => {
      if (error instanceof ApiError && error.code === 'STICKER_NOT_FOUND') {
        return setStickersAndCount(queryClient, (list) => list.filter((item) => item.id !== id))
      }
      if (packGone(error) && change.packId) {
        return forgetPack(queryClient, change.packId)
      }
    },
  })
}

/** Deletes a sticker by its id. One the server says is gone already (deleted in another tab) also leaves the list. */
export function useDeleteSticker() {
  const queryClient = useQueryClient()
  const remove = (id: string) => setStickersAndCount(queryClient, (list) => list.filter((item) => item.id !== id))
  return useMutation({
    mutationFn: deleteSticker,
    onSuccess: (_result, id) => remove(id),
    onError: (error, id) => {
      if (error instanceof ApiError && error.code === 'STICKER_NOT_FOUND') {
        return remove(id)
      }
    },
  })
}
