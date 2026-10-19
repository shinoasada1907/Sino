import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { API_STICKERS, sticker } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import type { StickerItem } from './stickers.types'
import { STICKERS_QUERY_KEY, useDeleteSticker, useStickers, useUploadSticker } from './useStickers'

const problem = (status: number, code: string) =>
  HttpResponse.json({ title: 'Error', status, code, instance: '/api/stickers' }, { status, headers: { 'Content-Type': 'application/problem+json' } })

function setup(cached?: StickerItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  if (cached) {
    queryClient.setQueryData(STICKERS_QUERY_KEY, cached)
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
        name = (await request.formData()).get('name')
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
