import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { API_PACKS, API_STICKERS, PACKED_STICKERS, sticker } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { formDataOf } from '@/test/nodeFile'
import { fetchPacks, fetchStickers } from './stickers.api'
import type { StickerItem, StickerPack } from './stickers.types'
import { PACKS_QUERY_KEY } from './stickersCache'
import { STICKERS_QUERY_KEY, useChangeSticker, useDeleteSticker, useStickers, useUploadSticker } from './useStickers'

const problem = (status: number, code: string) =>
  HttpResponse.json({ title: 'Error', status, code, instance: '/api/stickers' }, { status, headers: { 'Content-Type': 'application/problem+json' } })

function setup(cached?: StickerItem[], packs?: StickerPack[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  if (cached) {
    queryClient.setQueryData(STICKERS_QUERY_KEY, cached)
  }
  if (packs) {
    queryClient.setQueryData(PACKS_QUERY_KEY, packs)
  }
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

const PNG = new File([new Uint8Array([1])], 'meo.png', { type: 'image/png' })

describe('useStickers (ST-11)', () => {
  it('has no list until the server answers, then the list', async () => {
    server.use(http.get('/api/stickers', () => HttpResponse.json({ items: API_STICKERS })))
    const { wrapper } = setup()
    const { result } = renderHook(() => useStickers(), { wrapper })

    expect(result.current.stickers).toBeUndefined()
    await waitFor(() => expect(result.current.stickers).toEqual(API_STICKERS))
  })

  it('keeps the reason when the list cannot be read, and reads it again on retry', async () => {
    let calls = 0
    server.use(
      http.get('/api/stickers', () => {
        calls += 1
        return calls === 1 ? problem(500, 'INTERNAL') : HttpResponse.json({ items: API_STICKERS })
      }),
    )
    const { wrapper } = setup()
    const { result } = renderHook(() => useStickers(), { wrapper })
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'INTERNAL' }))
    expect(result.current.stickers).toBeUndefined()

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.stickers).toEqual(API_STICKERS))
    expect(result.current.error).toBeNull()
  })
})

describe('useUploadSticker (ST-11)', () => {
  it('puts the new sticker first in the list at once, with no new read of the list', async () => {
    const made = sticker({ id: 'st-new', name: 'moi', createdAt: '2026-10-19T10:00:00Z' })
    let listReads = 0
    server.use(
      http.get('/api/stickers', () => {
        listReads += 1
        return HttpResponse.json({ items: API_STICKERS })
      }),
      http.post('/api/stickers', () => HttpResponse.json(made, { status: 201 })),
    )
    const { queryClient, wrapper } = setup(API_STICKERS)
    const { result } = renderHook(() => useUploadSticker(), { wrapper })

    await act(() => result.current.mutateAsync({ file: PNG }))

    expect(queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)?.map((item) => item.id)).toEqual(['st-new', 'st-dance', 'st-cat'])
    expect(listReads).toBe(0)
  })

  it('does not list a sticker twice when the server answers with one the list already has', async () => {
    server.use(http.post('/api/stickers', () => HttpResponse.json({ ...API_STICKERS[1], name: 'meo moi' }, { status: 201 })))
    const { queryClient, wrapper } = setup(API_STICKERS)
    const { result } = renderHook(() => useUploadSticker(), { wrapper })

    await act(() => result.current.mutateAsync({ file: PNG }))

    const list = queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)
    expect(list?.map((item) => item.id)).toEqual(['st-cat', 'st-dance'])
    expect(list?.[0].name).toBe('meo moi')
  })

  it('does not start a list out of one sticker when the list was never read', async () => {
    server.use(http.post('/api/stickers', () => HttpResponse.json(sticker({ id: 'st-new' }), { status: 201 })))
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useUploadSticker(), { wrapper })

    await act(() => result.current.mutateAsync({ file: PNG }))

    expect(queryClient.getQueryData(STICKERS_QUERY_KEY)).toBeUndefined()
  })

  it('leaves the list as it was when the server refuses, and gives the code to the caller', async () => {
    server.use(http.post('/api/stickers', () => problem(409, 'STICKER_DUPLICATE')))
    const { queryClient, wrapper } = setup(API_STICKERS)
    const { result } = renderHook(() => useUploadSticker(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({ file: PNG })).rejects.toMatchObject({ status: 409, code: 'STICKER_DUPLICATE' })
    })

    expect(queryClient.getQueryData(STICKERS_QUERY_KEY)).toEqual(API_STICKERS)
  })

  it('sends the name when the caller gives one', async () => {
    let name: FormDataEntryValue | null = null
    server.use(
      http.post('/api/stickers', async ({ request }) => {
        name = (await formDataOf(request)).get('name')
        return HttpResponse.json(sticker({ id: 'st-new' }), { status: 201 })
      }),
    )
    const { wrapper } = setup(API_STICKERS)
    const { result } = renderHook(() => useUploadSticker(), { wrapper })

    await act(() => result.current.mutateAsync({ file: PNG, name: 'Mèo vui' }))

    expect(name).toBe('Mèo vui')
  })
})

describe('useDeleteSticker (ST-11)', () => {
  it('takes the sticker out of the list once the server has deleted it', async () => {
    server.use(http.delete('/api/stickers/st-cat', () => new HttpResponse(null, { status: 204 })))
    const { queryClient, wrapper } = setup(API_STICKERS)
    const { result } = renderHook(() => useDeleteSticker(), { wrapper })

    await act(() => result.current.mutateAsync('st-cat'))

    expect(queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)?.map((item) => item.id)).toEqual(['st-dance'])
  })

  it('keeps the sticker in the list when the delete fails', async () => {
    server.use(http.delete('/api/stickers/st-cat', () => problem(500, 'INTERNAL')))
    const { queryClient, wrapper } = setup(API_STICKERS)
    const { result } = renderHook(() => useDeleteSticker(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync('st-cat')).rejects.toMatchObject({ status: 500 })
    })

    expect(queryClient.getQueryData(STICKERS_QUERY_KEY)).toEqual(API_STICKERS)
  })

  it('takes a sticker out that the server says is gone already (deleted in another tab)', async () => {
    server.use(http.delete('/api/stickers/st-cat', () => problem(404, 'STICKER_NOT_FOUND')))
    const { queryClient, wrapper } = setup(API_STICKERS)
    const { result } = renderHook(() => useDeleteSticker(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync('st-cat')).rejects.toMatchObject({ status: 404, code: 'STICKER_NOT_FOUND' })
    })

    expect(queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)?.map((item) => item.id)).toEqual(['st-dance'])
  })
})

// A read of the list that crosses a change: it was read before the change was written and comes back after it, so it
// holds the list as it was (review 2026-10-19). The change must still show once everything has settled.
describe('a read of the list that crosses an upload or a delete', () => {
  const ids = (queryClient: QueryClient) => queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)?.map((item) => item.id)

  it('keeps the new sticker when a read of the list that started before the upload ends after it', async () => {
    const made = sticker({ id: 'st-new', name: 'moi', createdAt: '2026-10-19T10:00:00Z' })
    server.use(
      http.get('/api/stickers', async () => {
        await delay(60)
        return HttpResponse.json({ items: API_STICKERS })
      }),
      http.post('/api/stickers', () => HttpResponse.json(made, { status: 201 })),
    )
    const { queryClient, wrapper } = setup(API_STICKERS)
    const { result } = renderHook(() => useUploadSticker(), { wrapper })
    const reading = queryClient.fetchQuery({ queryKey: STICKERS_QUERY_KEY, queryFn: fetchStickers })

    await act(() => result.current.mutateAsync({ file: PNG }))
    await act(async () => {
      await reading.catch(() => undefined)
    })

    expect(ids(queryClient)).toEqual(['st-new', 'st-dance', 'st-cat'])
  })

  it('shows a sticker uploaded while the list was still on its way, once the list has come', async () => {
    const made = sticker({ id: 'st-new', name: 'moi', createdAt: '2026-10-19T10:00:00Z' })
    let reads = 0
    server.use(
      http.get('/api/stickers', async () => {
        reads += 1
        if (reads === 1) {
          // Read before the upload was written.
          await delay(60)
          return HttpResponse.json({ items: API_STICKERS })
        }
        return HttpResponse.json({ items: [made, ...API_STICKERS] })
      }),
      http.post('/api/stickers', () => HttpResponse.json(made, { status: 201 })),
    )
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => ({ list: useStickers(), upload: useUploadSticker() }), { wrapper })

    await act(() => result.current.upload.mutateAsync({ file: PNG }))

    await waitFor(() => expect(result.current.list.stickers?.map((item) => item.id)).toEqual(['st-new', 'st-dance', 'st-cat']))
    expect(ids(queryClient)).toEqual(['st-new', 'st-dance', 'st-cat'])
  })

  it('does not bring a deleted sticker back when a read of the list that started before the delete ends after it', async () => {
    server.use(
      http.get('/api/stickers', async () => {
        await delay(60)
        return HttpResponse.json({ items: API_STICKERS })
      }),
      http.delete('/api/stickers/st-cat', () => new HttpResponse(null, { status: 204 })),
    )
    const { queryClient, wrapper } = setup(API_STICKERS)
    const { result } = renderHook(() => useDeleteSticker(), { wrapper })
    const reading = queryClient.fetchQuery({ queryKey: STICKERS_QUERY_KEY, queryFn: fetchStickers })

    await act(() => result.current.mutateAsync('st-cat'))
    await act(async () => {
      await reading.catch(() => undefined)
    })

    expect(ids(queryClient)).toEqual(['st-dance'])
  })
})

/** Each pack as `[id, stickerCount, coverStickerId]`. */
const counts = (queryClient: QueryClient) =>
  queryClient.getQueryData<StickerPack[]>(PACKS_QUERY_KEY)?.map((item) => [item.id, item.stickerCount, item.coverStickerId])
const packOf = (queryClient: QueryClient, id: string) => queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)?.find((item) => item.id === id)?.packId

describe('stickers in packs (SP-05)', () => {
  it('uploads into a pack: the form has the pack, and the pack counts the new sticker as its newest', async () => {
    let packId: FormDataEntryValue | null = null
    const made = sticker({ id: 'st-new', packId: 'pk-cats', createdAt: '2026-10-20T10:00:00Z' })
    server.use(
      http.post('/api/stickers', async ({ request }) => {
        packId = (await formDataOf(request)).get('packId')
        return HttpResponse.json(made, { status: 201 })
      }),
    )
    const { queryClient, wrapper } = setup(PACKED_STICKERS, API_PACKS)
    const { result } = renderHook(() => useUploadSticker(), { wrapper })

    await act(() => result.current.mutateAsync({ file: PNG, packId: 'pk-cats' }))

    expect(packId).toBe('pk-cats')
    expect(counts(queryClient)).toEqual([
      ['pk-cats', 2, 'st-new'],
      ['pk-dogs', 0, null],
    ])
  })

  it('forgets a pack an upload was refused for as gone, and keeps no sticker', async () => {
    server.use(http.post('/api/stickers', () => problem(404, 'STICKER_PACK_NOT_FOUND')))
    const { queryClient, wrapper } = setup(PACKED_STICKERS, API_PACKS)
    const { result } = renderHook(() => useUploadSticker(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({ file: PNG, packId: 'pk-cats' })).rejects.toMatchObject({ code: 'STICKER_PACK_NOT_FOUND' })
    })

    expect(counts(queryClient)).toEqual([['pk-dogs', 0, null]])
    expect(queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)?.map((item) => [item.id, item.packId])).toEqual([
      ['st-dance', null],
      ['st-cat', null],
    ])
  })

  it('a deleted sticker leaves the count of its pack, and the cover goes to the next newest or to none', async () => {
    const older = sticker({ id: 'st-old', packId: 'pk-cats', createdAt: '2026-10-19T07:00:00Z' })
    server.use(http.delete('/api/stickers/st-cat', () => new HttpResponse(null, { status: 204 })))
    const { queryClient, wrapper } = setup([...PACKED_STICKERS, older], [{ ...API_PACKS[0], stickerCount: 2 }, API_PACKS[1]])
    const { result } = renderHook(() => useDeleteSticker(), { wrapper })

    await act(() => result.current.mutateAsync('st-cat'))

    expect(counts(queryClient)).toEqual([
      ['pk-cats', 1, 'st-old'],
      ['pk-dogs', 0, null],
    ])
  })

  it('moves a sticker to another pack: the sticker as the server gives it, and both packs counted again', async () => {
    server.use(http.patch('/api/stickers/st-cat', () => HttpResponse.json({ ...PACKED_STICKERS[1], packId: 'pk-dogs' })))
    const { queryClient, wrapper } = setup(PACKED_STICKERS, API_PACKS)
    const { result } = renderHook(() => useChangeSticker(), { wrapper })

    await act(() => result.current.mutateAsync({ id: 'st-cat', change: { packId: 'pk-dogs' } }))

    expect(packOf(queryClient, 'st-cat')).toBe('pk-dogs')
    expect(counts(queryClient)).toEqual([
      ['pk-cats', 0, null],
      ['pk-dogs', 1, 'st-cat'],
    ])
  })

  it('takes a sticker out of its pack, and renames one in place', async () => {
    server.use(
      http.patch('/api/stickers/st-cat', () => HttpResponse.json({ ...PACKED_STICKERS[1], packId: null })),
      http.patch('/api/stickers/st-dance', () => HttpResponse.json({ ...PACKED_STICKERS[0], name: 'nhảy múa' })),
    )
    const { queryClient, wrapper } = setup(PACKED_STICKERS, API_PACKS)
    const { result } = renderHook(() => useChangeSticker(), { wrapper })

    await act(() => result.current.mutateAsync({ id: 'st-cat', change: { packId: null } }))
    await act(() => result.current.mutateAsync({ id: 'st-dance', change: { name: 'nhảy múa' } }))

    const list = queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)
    expect(list?.map((item) => [item.id, item.name, item.packId])).toEqual([
      ['st-dance', 'nhảy múa', null],
      ['st-cat', 'meo', null],
    ])
    expect(counts(queryClient)).toEqual([
      ['pk-cats', 0, null],
      ['pk-dogs', 0, null],
    ])
  })

  it('takes a sticker out of the list that the server says is gone, and out of the count of its pack', async () => {
    server.use(http.patch('/api/stickers/st-cat', () => problem(404, 'STICKER_NOT_FOUND')))
    const { queryClient, wrapper } = setup(PACKED_STICKERS, API_PACKS)
    const { result } = renderHook(() => useChangeSticker(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'st-cat', change: { packId: 'pk-dogs' } })).rejects.toMatchObject({ code: 'STICKER_NOT_FOUND' })
    })

    expect(queryClient.getQueryData<StickerItem[]>(STICKERS_QUERY_KEY)?.map((item) => item.id)).toEqual(['st-dance'])
    expect(counts(queryClient)).toEqual([
      ['pk-cats', 0, null],
      ['pk-dogs', 0, null],
    ])
  })

  it('forgets the pack a move was refused for as gone, and leaves the sticker where it was', async () => {
    server.use(http.patch('/api/stickers/st-dance', () => problem(404, 'STICKER_PACK_NOT_FOUND')))
    const { queryClient, wrapper } = setup(PACKED_STICKERS, API_PACKS)
    const { result } = renderHook(() => useChangeSticker(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'st-dance', change: { packId: 'pk-dogs' } })).rejects.toMatchObject({ code: 'STICKER_PACK_NOT_FOUND' })
    })

    expect(counts(queryClient)).toEqual([['pk-cats', 1, 'st-cat']])
    expect(packOf(queryClient, 'st-dance')).toBeNull()
    expect(packOf(queryClient, 'st-cat')).toBe('pk-cats')
  })

  it('changes nothing when a change fails for another reason', async () => {
    server.use(http.patch('/api/stickers/st-cat', () => problem(500, 'INTERNAL')))
    const { queryClient, wrapper } = setup(PACKED_STICKERS, API_PACKS)
    const { result } = renderHook(() => useChangeSticker(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'st-cat', change: { packId: 'pk-dogs' } })).rejects.toMatchObject({ status: 500 })
    })

    expect(queryClient.getQueryData(STICKERS_QUERY_KEY)).toEqual(PACKED_STICKERS)
    expect(queryClient.getQueryData(PACKS_QUERY_KEY)).toEqual(API_PACKS)
  })

  it('does not start a list of packs when the packs were never read', async () => {
    server.use(http.patch('/api/stickers/st-cat', () => HttpResponse.json({ ...PACKED_STICKERS[1], packId: 'pk-dogs' })))
    const { queryClient, wrapper } = setup(PACKED_STICKERS)
    const { result } = renderHook(() => useChangeSticker(), { wrapper })

    await act(() => result.current.mutateAsync({ id: 'st-cat', change: { packId: 'pk-dogs' } }))

    expect(queryClient.getQueryData(PACKS_QUERY_KEY)).toBeUndefined()
  })

  it('reads the packs again when it has them but not the stickers to count them by', async () => {
    server.use(http.post('/api/stickers', () => HttpResponse.json(sticker({ id: 'st-new', packId: 'pk-cats' }), { status: 201 })))
    const { queryClient, wrapper } = setup(undefined, API_PACKS)
    const { result } = renderHook(() => useUploadSticker(), { wrapper })

    await act(() => result.current.mutateAsync({ file: PNG, packId: 'pk-cats' }))

    // Marked stale: read again as soon as a screen shows them, and not before.
    expect(queryClient.getQueryState(PACKS_QUERY_KEY)?.isInvalidated).toBe(true)
  })

  it('keeps the counts of a move when a read of the packs that started before it ends after it', async () => {
    server.use(
      http.get('/api/sticker-packs', async () => {
        await delay(60)
        return HttpResponse.json({ items: API_PACKS })
      }),
      http.patch('/api/stickers/st-cat', () => HttpResponse.json({ ...PACKED_STICKERS[1], packId: 'pk-dogs' })),
    )
    const { queryClient, wrapper } = setup(PACKED_STICKERS, API_PACKS)
    const { result } = renderHook(() => useChangeSticker(), { wrapper })
    const reading = queryClient.fetchQuery({ queryKey: PACKS_QUERY_KEY, queryFn: fetchPacks })

    await act(() => result.current.mutateAsync({ id: 'st-cat', change: { packId: 'pk-dogs' } }))
    await act(async () => {
      await reading.catch(() => undefined)
    })

    expect(counts(queryClient)).toEqual([
      ['pk-cats', 0, null],
      ['pk-dogs', 1, 'st-cat'],
    ])
  })

  it('keeps a move when a read of the stickers that started before it ends after it', async () => {
    server.use(
      http.get('/api/stickers', async () => {
        await delay(60)
        return HttpResponse.json({ items: PACKED_STICKERS })
      }),
      http.patch('/api/stickers/st-cat', () => HttpResponse.json({ ...PACKED_STICKERS[1], packId: 'pk-dogs' })),
    )
    const { queryClient, wrapper } = setup(PACKED_STICKERS, API_PACKS)
    const { result } = renderHook(() => useChangeSticker(), { wrapper })
    const reading = queryClient.fetchQuery({ queryKey: STICKERS_QUERY_KEY, queryFn: fetchStickers })

    await act(() => result.current.mutateAsync({ id: 'st-cat', change: { packId: 'pk-dogs' } }))
    await act(async () => {
      await reading.catch(() => undefined)
    })

    expect(packOf(queryClient, 'st-cat')).toBe('pk-dogs')
  })
})
