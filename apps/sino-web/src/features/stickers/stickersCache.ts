import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { StickerItem, StickerPack } from './stickers.types'

export const STICKERS_QUERY_KEY = ['stickers'] as const
export const PACKS_QUERY_KEY = ['sticker-packs'] as const

// A change is written into the lists the screen holds, so it shows at once without reading a whole list again. A read of a
// list still on its way may have been answered before the change was written, and would write the old list over it when
// it lands, so it is called off first. With no list yet the change cannot be written in: the list is read again instead
// (only while a screen shows it), and that read has the change. A first read is not called off by a new one (the new one
// would wait for it), hence the explicit cancel in both cases.
async function setList<T>(queryClient: QueryClient, queryKey: QueryKey, change: (list: T[]) => T[]) {
  await queryClient.cancelQueries({ queryKey })
  if (queryClient.getQueryData(queryKey) === undefined) {
    await queryClient.invalidateQueries({ queryKey })
    return
  }
  queryClient.setQueryData<T[]>(queryKey, (list) => list && change(list))
}

export const setStickers = (queryClient: QueryClient, change: (list: StickerItem[]) => StickerItem[]) =>
  setList(queryClient, STICKERS_QUERY_KEY, change)

export const setPacks = (queryClient: QueryClient, change: (list: StickerPack[]) => StickerPack[]) =>
  setList(queryClient, PACKS_QUERY_KEY, change)

/**
 * After the stickers changed: the count and the cover of each pack, worked out again from the list of stickers, as the
 * server works them out (the cover is the newest sticker of the pack, and the list is the newest first). Without that list
 * the packs cannot be counted here, and are read again.
 */
async function countPacks(queryClient: QueryClient) {
  const stickers = queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)
  if (stickers === undefined) {
    await queryClient.cancelQueries({ queryKey: PACKS_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: PACKS_QUERY_KEY })
    return
  }
  await setPacks(queryClient, (packs) =>
    packs.map((pack) => {
      const held = stickers.filter((item) => item.packId === pack.id)
      return { ...pack, stickerCount: held.length, coverStickerId: held[0]?.id ?? null }
    }),
  )
}

/** Changes the list of stickers, then counts the packs again. */
export async function setStickersAndCount(queryClient: QueryClient, change: (list: StickerItem[]) => StickerItem[]) {
  await setStickers(queryClient, change)
  await countPacks(queryClient)
}

/**
 * A pack that is no more, deleted here or in another tab: out of the packs, and its stickers in no pack, as the server put
 * them (DN-1).
 */
export async function forgetPack(queryClient: QueryClient, id: string) {
  await setPacks(queryClient, (packs) => packs.filter((pack) => pack.id !== id))
  await setStickers(queryClient, (list) => list.map((item) => (item.packId === id ? { ...item, packId: null } : item)))
}
