import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { ApiError } from '@/shared/api/problem'
import { API_PACKS, API_STICKERS, pack, sticker } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import {
  changeSticker,
  createPack,
  deletePack,
  deleteSticker,
  fetchPacks,
  fetchStickers,
  renamePack,
  stickerContentUrl,
  uploadSticker,
} from './stickers.api'

const problem = (status: number, code: string) =>
  HttpResponse.json({ title: 'Error', status, code, instance: '/api/stickers' }, { status, headers: { 'Content-Type': 'application/problem+json' } })

const PNG = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'meo.png', { type: 'image/png' })

describe('the sticker requests on the custom-stickers API (ST-11)', () => {
  it('reads the list, newest first as the server gives it', async () => {
    server.use(http.get('/api/stickers', () => HttpResponse.json({ items: API_STICKERS })))

    expect(await fetchStickers()).toEqual(API_STICKERS)
  })

  it('reads an empty library', async () => {
    server.use(http.get('/api/stickers', () => HttpResponse.json({ items: [] })))

    expect(await fetchStickers()).toEqual([])
  })

  it('uploads the file and the name as a form, and gives back the sticker the server made', async () => {
    const made = sticker({ id: 'st-new', name: 'Mèo vui' })
    const upload = vi.spyOn(api, 'upload').mockResolvedValue(made)

    expect(await uploadSticker(PNG, 'Mèo vui')).toEqual(made)

    expect(upload).toHaveBeenCalledTimes(1)
    const [path, form] = upload.mock.calls[0]
    expect(path).toBe('/api/stickers')
    // The file object itself, with its name: the browser writes it into the part, and the server names the sticker by it.
    expect(form.get('file')).toBe(PNG)
    expect((form.get('file') as File).name).toBe('meo.png')
    expect(form.get('name')).toBe('Mèo vui')
  })

  it('leaves the name out when there is none, so the server names the sticker by its file', async () => {
    const upload = vi.spyOn(api, 'upload').mockResolvedValue(sticker({ id: 'st-new' }))

    await uploadSticker(PNG)

    expect(upload.mock.calls[0][1].has('name')).toBe(false)
  })

  it('puts the sticker into a pack with the part packId, and leaves the part out for no pack (SP-05)', async () => {
    const upload = vi.spyOn(api, 'upload').mockResolvedValue(sticker({ id: 'st-new', packId: 'pk-cats' }))

    await uploadSticker(PNG, undefined, 'pk-cats')
    await uploadSticker(PNG, 'Mèo', null)
    await uploadSticker(PNG)

    expect(upload.mock.calls[0][1].get('packId')).toBe('pk-cats')
    expect(upload.mock.calls[0][1].has('name')).toBe(false)
    expect(upload.mock.calls[1][1].has('packId')).toBe(false)
    expect(upload.mock.calls[2][1].has('packId')).toBe(false)
  })

  it('goes over the wire as a POST with a multipart body (the form reaches the server)', async () => {
    let type: string | null = null
    server.use(
      http.post('/api/stickers', ({ request }) => {
        type = request.headers.get('Content-Type')
        return HttpResponse.json(sticker({ id: 'st-new' }), { status: 201 })
      }),
    )

    expect((await uploadSticker(PNG)).id).toBe('st-new')
    expect(type).toMatch(/^multipart\/form-data; boundary=/)
  })

  it('deletes a sticker by its id', async () => {
    let deleted: string | undefined
    server.use(
      http.delete('/api/stickers/:id', ({ params }) => {
        deleted = String(params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await deleteSticker('st-cat')

    expect(deleted).toBe('st-cat')
  })

  it('escapes the id of the sticker it deletes', async () => {
    let path: string | undefined
    server.use(
      http.delete('/api/stickers/*', ({ request }) => {
        path = new URL(request.url).pathname
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await deleteSticker('a b/c')

    expect(path).toBe('/api/stickers/a%20b%2Fc')
  })

  it('changes a sticker with a PATCH that carries only what changes, and a null packId as null (SP-05)', async () => {
    const bodies: unknown[] = []
    let path: string | undefined
    server.use(
      http.patch('/api/stickers/*', async ({ request }) => {
        path = new URL(request.url).pathname
        bodies.push(await request.json())
        return HttpResponse.json(sticker({ id: 'st-cat', name: 'Mèo vui', packId: 'pk-dogs' }))
      }),
    )

    expect(await changeSticker('st-cat', { packId: 'pk-dogs' })).toMatchObject({ id: 'st-cat', packId: 'pk-dogs' })
    await changeSticker('st-cat', { packId: null })
    await changeSticker('st-cat', { name: 'Mèo vui' })
    await changeSticker('a b/c', { name: 'x', packId: 'pk-dogs' })

    // "packId": null is what takes the sticker out of its pack; a field left out is one the server keeps.
    expect(bodies).toEqual([{ packId: 'pk-dogs' }, { packId: null }, { name: 'Mèo vui' }, { name: 'x', packId: 'pk-dogs' }])
    expect(path).toBe('/api/stickers/a%20b%2Fc')
  })

  it('keeps the code of a refusal, whatever the request', async () => {
    server.use(
      http.get('/api/stickers', () => problem(500, 'INTERNAL')),
      http.post('/api/stickers', () => problem(409, 'STICKER_DUPLICATE')),
      http.delete('/api/stickers/st-gone', () => problem(404, 'STICKER_NOT_FOUND')),
    )

    await expect(fetchStickers()).rejects.toMatchObject({ status: 500, code: 'INTERNAL' })
    await expect(uploadSticker(PNG)).rejects.toMatchObject({ status: 409, code: 'STICKER_DUPLICATE' })
    await expect(deleteSticker('st-gone')).rejects.toBeInstanceOf(ApiError)
  })

  it('names the address of the picture of a sticker, escaping the id', () => {
    expect(stickerContentUrl('st-cat')).toBe('/api/stickers/st-cat/content')
    expect(stickerContentUrl('a b/c')).toBe('/api/stickers/a%20b%2Fc/content')
  })
})

describe('the sticker pack requests on the sticker-packs API (SP-05)', () => {
  it('reads the packs, the oldest first as the server gives them', async () => {
    server.use(http.get('/api/sticker-packs', () => HttpResponse.json({ items: API_PACKS })))

    expect(await fetchPacks()).toEqual(API_PACKS)
  })

  it('creates a pack with its name and gives back the pack the server made', async () => {
    let body: unknown
    server.use(
      http.post('/api/sticker-packs', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(pack({ id: 'pk-new', name: 'Gà' }), { status: 201 })
      }),
    )

    expect(await createPack('Gà')).toEqual(pack({ id: 'pk-new', name: 'Gà' }))
    expect(body).toEqual({ name: 'Gà' })
  })

  it('renames a pack by its id, escaping it', async () => {
    let body: unknown
    let path: string | undefined
    server.use(
      http.patch('/api/sticker-packs/*', async ({ request }) => {
        path = new URL(request.url).pathname
        body = await request.json()
        return HttpResponse.json(pack({ id: 'a b/c', name: 'Mèo con' }))
      }),
    )

    expect((await renamePack('a b/c', 'Mèo con')).name).toBe('Mèo con')
    expect(body).toEqual({ name: 'Mèo con' })
    expect(path).toBe('/api/sticker-packs/a%20b%2Fc')
  })

  it('deletes a pack by its id, escaping it', async () => {
    let path: string | undefined
    server.use(
      http.delete('/api/sticker-packs/*', ({ request }) => {
        path = new URL(request.url).pathname
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await deletePack('a b/c')

    expect(path).toBe('/api/sticker-packs/a%20b%2Fc')
  })

  it('keeps the code of a refusal, whatever the request', async () => {
    server.use(
      http.get('/api/sticker-packs', () => problem(500, 'INTERNAL')),
      http.post('/api/sticker-packs', () => problem(409, 'STICKER_PACK_LIMIT_REACHED')),
      http.patch('/api/sticker-packs/pk-cats', () => problem(409, 'STICKER_PACK_NAME_TAKEN')),
      http.delete('/api/sticker-packs/pk-gone', () => problem(404, 'STICKER_PACK_NOT_FOUND')),
      http.patch('/api/stickers/st-cat', () => problem(404, 'STICKER_PACK_NOT_FOUND')),
    )

    await expect(fetchPacks()).rejects.toMatchObject({ status: 500, code: 'INTERNAL' })
    await expect(createPack('Gà')).rejects.toMatchObject({ status: 409, code: 'STICKER_PACK_LIMIT_REACHED' })
    await expect(renamePack('pk-cats', 'Chó')).rejects.toMatchObject({ status: 409, code: 'STICKER_PACK_NAME_TAKEN' })
    await expect(deletePack('pk-gone')).rejects.toMatchObject({ status: 404, code: 'STICKER_PACK_NOT_FOUND' })
    await expect(changeSticker('st-cat', { packId: 'pk-gone' })).rejects.toMatchObject({ status: 404, code: 'STICKER_PACK_NOT_FOUND' })
  })
})
