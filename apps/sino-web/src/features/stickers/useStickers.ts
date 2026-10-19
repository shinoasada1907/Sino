import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/problem'
import { deleteSticker, fetchStickers, uploadSticker } from './stickers.api'
import type { StickerItem } from './stickers.types'

export const STICKERS_QUERY_KEY = ['stickers'] as const

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

// Written into the list the screen holds, so a change shows at once without reading the whole list again. A read of the
// list still on its way may have been answered before the change was written, and would write the old list over it when
// it lands, so it is called off first. With no list yet the change cannot be written in: the list is read again instead
// (only while the screen shows it), and that read has the change. A first read is not called off by a new one (the new
// one would wait for it), hence the explicit cancel in both cases.
async function setStickers(queryClient: QueryClient, change: (list: StickerItem[]) => StickerItem[]) {
  await queryClient.cancelQueries({ queryKey: STICKERS_QUERY_KEY })
  if (queryClient.getQueryData(STICKERS_QUERY_KEY) === undefined) {
    await queryClient.invalidateQueries({ queryKey: STICKERS_QUERY_KEY })
    return
  }
  queryClient.setQueryData<StickerItem[]>(STICKERS_QUERY_KEY, (list) => list && change(list))
}

/** Uploads one file; the new sticker is first in the list. A refusal reaches the caller as an `ApiError` and changes nothing. */
export function useUploadSticker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name?: string }) => uploadSticker(file, name),
    onSuccess: (made) => setStickers(queryClient, (list) => [made, ...list.filter((item) => item.id !== made.id)]),
  })
}

/** Deletes a sticker by its id. One the server says is gone already (deleted in another tab) also leaves the list. */
export function useDeleteSticker() {
  const queryClient = useQueryClient()
  const remove = (id: string) => setStickers(queryClient, (list) => list.filter((item) => item.id !== id))
  return useMutation({
    mutationFn: deleteSticker,
    onSuccess: (_result, id) => remove(id),
    onError: (error, id) => {
      if (error instanceof ApiError && error.code === 'STICKER_NOT_FOUND') {
        remove(id)
      }
    },
  })
}
