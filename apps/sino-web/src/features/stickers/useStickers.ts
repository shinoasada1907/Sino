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

// Written into the list the screen holds, so a change shows at once without reading the whole list again. A list that was
// never read stays unread (the updater gives nothing back), and the screen reads it when it opens.
function setStickers(queryClient: QueryClient, change: (list: StickerItem[]) => StickerItem[]) {
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
