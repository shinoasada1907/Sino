import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { API_PACKS, PACKED_STICKERS, pack } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { fetchPacks, fetchStickers } from './stickers.api'
import type { StickerItem, StickerPack } from './stickers.types'
import { PACKS_QUERY_KEY, STICKERS_QUERY_KEY } from './stickersCache'
import { useCreatePack, useDeletePack, usePacks, useRenamePack } from './usePacks'

const problem = (status: number, code: string) =>
  HttpResponse.json({ title: 'Error', status, code, instance: '/api/sticker-packs' }, { status, headers: { 'Content-Type': 'application/problem+json' } })

function setup(cached: { packs?: StickerPack[]; stickers?: StickerItem[] } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  if (cached.packs) {
    queryClient.setQueryData(PACKS_QUERY_KEY, cached.packs)
  }
  if (cached.stickers) {
    queryClient.setQueryData(STICKERS_QUERY_KEY, cached.stickers)
  }
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

const packsIn = (queryClient: QueryClient) => queryClient.getQueryData<StickerPack[]>(PACKS_QUERY_KEY)
const packIdsIn = (queryClient: QueryClient) => packsIn(queryClient)?.map((item) => item.id)
const stickersIn = (queryClient: QueryClient) => queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)

describe('usePacks (SP-05)', () => {
  it('has no packs until the server answers, then the packs', async () => {
    server.use(http.get('/api/sticker-packs', () => HttpResponse.json({ items: API_PACKS })))
    const { wrapper } = setup()
    const { result } = renderHook(() => usePacks(), { wrapper })

    expect(result.current.packs).toBeUndefined()
    await waitFor(() => expect(result.current.packs).toEqual(API_PACKS))
    expect(result.current.receivedAt).toBeGreaterThan(0)
  })

  it('keeps the reason when the packs cannot be read, and reads them again on retry', async () => {
    let calls = 0
    server.use(
      http.get('/api/sticker-packs', () => {
        calls += 1
        return calls === 1 ? problem(500, 'INTERNAL') : HttpResponse.json({ items: API_PACKS })
      }),
    )
    const { wrapper } = setup()
    const { result } = renderHook(() => usePacks(), { wrapper })
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'INTERNAL' }))

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.packs).toEqual(API_PACKS))
    expect(result.current.error).toBeNull()
  })
})

describe('useCreatePack (SP-05)', () => {
  it('puts the new pack last, as the newest, with no new read of the packs', async () => {
    let reads = 0
    server.use(
      http.get('/api/sticker-packs', () => {
        reads += 1
        return HttpResponse.json({ items: API_PACKS })
      }),
      http.post('/api/sticker-packs', () => HttpResponse.json(pack({ id: 'pk-hens', name: 'Gà' }), { status: 201 })),
    )
    const { queryClient, wrapper } = setup({ packs: API_PACKS })
    const { result } = renderHook(() => useCreatePack(), { wrapper })

    await expect(act(() => result.current.mutateAsync('Gà'))).resolves.toMatchObject({ id: 'pk-hens' })

    expect(packIdsIn(queryClient)).toEqual(['pk-cats', 'pk-dogs', 'pk-hens'])
    expect(reads).toBe(0)
  })

  it('leaves the packs as they were when the server refuses, and gives the code to the caller', async () => {
    server.use(http.post('/api/sticker-packs', () => problem(409, 'STICKER_PACK_NAME_TAKEN')))
    const { queryClient, wrapper } = setup({ packs: API_PACKS })
    const { result } = renderHook(() => useCreatePack(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync('mèo')).rejects.toMatchObject({ status: 409, code: 'STICKER_PACK_NAME_TAKEN' })
    })

    expect(packsIn(queryClient)).toEqual(API_PACKS)
  })

  it('does not start a list out of one pack when the packs were never read', async () => {
    server.use(http.post('/api/sticker-packs', () => HttpResponse.json(pack({ id: 'pk-hens', name: 'Gà' }), { status: 201 })))
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useCreatePack(), { wrapper })

    await act(() => result.current.mutateAsync('Gà'))

    expect(packsIn(queryClient)).toBeUndefined()
  })
})

describe('useRenamePack (SP-05)', () => {
  it('writes the new name in place', async () => {
    server.use(http.patch('/api/sticker-packs/pk-cats', () => HttpResponse.json({ ...API_PACKS[0], name: 'Mèo con' })))
    const { queryClient, wrapper } = setup({ packs: API_PACKS })
    const { result } = renderHook(() => useRenamePack(), { wrapper })

    await act(() => result.current.mutateAsync({ id: 'pk-cats', name: 'Mèo con' }))

    expect(packsIn(queryClient)?.map((item) => item.name)).toEqual(['Mèo con', 'Chó'])
  })

  it('keeps the name when the server refuses it', async () => {
    server.use(http.patch('/api/sticker-packs/pk-dogs', () => problem(409, 'STICKER_PACK_NAME_TAKEN')))
    const { queryClient, wrapper } = setup({ packs: API_PACKS })
    const { result } = renderHook(() => useRenamePack(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'pk-dogs', name: 'mèo' })).rejects.toMatchObject({ code: 'STICKER_PACK_NAME_TAKEN' })
    })

    expect(packsIn(queryClient)).toEqual(API_PACKS)
  })

  it('forgets a pack the server says is gone (deleted in another tab), and its stickers are in no pack', async () => {
    server.use(http.patch('/api/sticker-packs/pk-cats', () => problem(404, 'STICKER_PACK_NOT_FOUND')))
    const { queryClient, wrapper } = setup({ packs: API_PACKS, stickers: PACKED_STICKERS })
    const { result } = renderHook(() => useRenamePack(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'pk-cats', name: 'Mèo con' })).rejects.toMatchObject({ code: 'STICKER_PACK_NOT_FOUND' })
    })

    expect(packIdsIn(queryClient)).toEqual(['pk-dogs'])
    expect(stickersIn(queryClient)?.map((item) => item.packId)).toEqual([null, null])
  })
})

describe('useDeletePack (SP-05)', () => {
  it('takes the pack out, and puts its stickers in no pack, with no new read of either list', async () => {
    let reads = 0
    server.use(
      http.get('/api/*', () => {
        reads += 1
        return HttpResponse.json({ items: [] })
      }),
      http.delete('/api/sticker-packs/pk-cats', () => new HttpResponse(null, { status: 204 })),
    )
    const { queryClient, wrapper } = setup({ packs: API_PACKS, stickers: PACKED_STICKERS })
    const { result } = renderHook(() => useDeletePack(), { wrapper })

    await act(() => result.current.mutateAsync('pk-cats'))

    expect(packIdsIn(queryClient)).toEqual(['pk-dogs'])
    // The stickers stay in the library (DN-1): only their pack is gone.
    expect(stickersIn(queryClient)?.map((item) => [item.id, item.packId])).toEqual([
      ['st-dance', null],
      ['st-cat', null],
    ])
    expect(reads).toBe(0)
  })

  it('keeps the pack and its stickers when the delete fails', async () => {
    server.use(http.delete('/api/sticker-packs/pk-cats', () => problem(500, 'INTERNAL')))
    const { queryClient, wrapper } = setup({ packs: API_PACKS, stickers: PACKED_STICKERS })
    const { result } = renderHook(() => useDeletePack(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync('pk-cats')).rejects.toMatchObject({ status: 500 })
    })

    expect(packsIn(queryClient)).toEqual(API_PACKS)
    expect(stickersIn(queryClient)).toEqual(PACKED_STICKERS)
  })

  it('takes a pack out that the server says is gone already', async () => {
    server.use(http.delete('/api/sticker-packs/pk-cats', () => problem(404, 'STICKER_PACK_NOT_FOUND')))
    const { queryClient, wrapper } = setup({ packs: API_PACKS, stickers: PACKED_STICKERS })
    const { result } = renderHook(() => useDeletePack(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync('pk-cats')).rejects.toMatchObject({ code: 'STICKER_PACK_NOT_FOUND' })
    })

    expect(packIdsIn(queryClient)).toEqual(['pk-dogs'])
    expect(stickersIn(queryClient)?.map((item) => item.packId)).toEqual([null, null])
  })
})

// A read that crosses a change: it was read before the change was written and comes back after it, so it holds the list as
// it was. The change must still show once everything has settled (as for the stickers, review 2026-10-19).
describe('a read that crosses a change of the packs (SP-05)', () => {
  it('keeps a new pack when a read of the packs that started before it was made ends after it', async () => {
    server.use(
      http.get('/api/sticker-packs', async () => {
        await delay(60)
        return HttpResponse.json({ items: API_PACKS })
      }),
      http.post('/api/sticker-packs', () => HttpResponse.json(pack({ id: 'pk-hens', name: 'Gà' }), { status: 201 })),
    )
    const { queryClient, wrapper } = setup({ packs: API_PACKS })
    const { result } = renderHook(() => useCreatePack(), { wrapper })
    const reading = queryClient.fetchQuery({ queryKey: PACKS_QUERY_KEY, queryFn: fetchPacks })

    await act(() => result.current.mutateAsync('Gà'))
    await act(async () => {
      await reading.catch(() => undefined)
    })

    expect(packIdsIn(queryClient)).toEqual(['pk-cats', 'pk-dogs', 'pk-hens'])
  })

  it('does not put the stickers of a deleted pack back into it when a read of the stickers crosses the delete', async () => {
    server.use(
      http.get('/api/stickers', async () => {
        await delay(60)
        return HttpResponse.json({ items: PACKED_STICKERS })
      }),
      http.delete('/api/sticker-packs/pk-cats', () => new HttpResponse(null, { status: 204 })),
    )
    const { queryClient, wrapper } = setup({ packs: API_PACKS, stickers: PACKED_STICKERS })
    const { result } = renderHook(() => useDeletePack(), { wrapper })
    const reading = queryClient.fetchQuery({ queryKey: STICKERS_QUERY_KEY, queryFn: fetchStickers })

    await act(() => result.current.mutateAsync('pk-cats'))
    await act(async () => {
      await reading.catch(() => undefined)
    })

    expect(stickersIn(queryClient)?.map((item) => item.packId)).toEqual([null, null])
  })

  it('shows a pack made while the packs were still on their way, once they have come', async () => {
    const made = pack({ id: 'pk-hens', name: 'Gà' })
    let reads = 0
    server.use(
      http.get('/api/sticker-packs', async () => {
        reads += 1
        if (reads === 1) {
          await delay(60)
          return HttpResponse.json({ items: API_PACKS })
        }
        return HttpResponse.json({ items: [...API_PACKS, made] })
      }),
      http.post('/api/sticker-packs', () => HttpResponse.json(made, { status: 201 })),
    )
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => ({ list: usePacks(), create: useCreatePack() }), { wrapper })

    await act(() => result.current.create.mutateAsync('Gà'))

    await waitFor(() => expect(result.current.list.packs?.map((item) => item.id)).toEqual(['pk-cats', 'pk-dogs', 'pk-hens']))
    expect(packIdsIn(queryClient)).toEqual(['pk-cats', 'pk-dogs', 'pk-hens'])
  })
})
