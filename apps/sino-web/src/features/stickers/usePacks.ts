import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/problem'
import { createPack, deletePack, fetchPacks, renamePack } from './stickers.api'
import type { StickerPack } from './stickers.types'
import { forgetPack, PACKS_QUERY_KEY, setPacks } from './stickersCache'

export interface PacksQuery {
  packs: StickerPack[] | undefined
  /** When the packs arrived (milliseconds since the epoch, 0 before any data). */
  receivedAt: number
  /** Why the last load failed; the page shows it only while there are no packs. */
  error: Error | null
  retry: () => void
}

/** The sticker packs of the owner, the oldest first; read again at each visit of the screen, like the stickers. */
export function usePacks(): PacksQuery {
  const { data, dataUpdatedAt, error, refetch } = useQuery({ queryKey: PACKS_QUERY_KEY, queryFn: fetchPacks })
  return { packs: data, receivedAt: dataUpdatedAt, error, retry: () => void refetch() }
}

const packGone = (error: Error) => error instanceof ApiError && error.code === 'STICKER_PACK_NOT_FOUND'

/** Creates a pack; it comes last, as the newest. A refusal (name taken, too many packs) reaches the caller and changes nothing. */
export function useCreatePack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createPack,
    onSuccess: (made) => setPacks(queryClient, (packs) => [...packs.filter((item) => item.id !== made.id), made]),
  })
}

/** Renames a pack in place. A pack the server says is gone (deleted in another tab) is forgotten. */
export function useRenamePack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renamePack(id, name),
    onSuccess: (renamed) => setPacks(queryClient, (packs) => packs.map((item) => (item.id === renamed.id ? renamed : item))),
    onError: (error, { id }) => {
      if (packGone(error)) {
        return forgetPack(queryClient, id)
      }
    },
  })
}

/** Deletes a pack; its stickers stay, in no pack. One the server says is gone already is forgotten all the same. */
export function useDeletePack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deletePack,
    onSuccess: (_result, id) => forgetPack(queryClient, id),
    onError: (error, id) => {
      if (packGone(error)) {
        return forgetPack(queryClient, id)
      }
    },
  })
}
