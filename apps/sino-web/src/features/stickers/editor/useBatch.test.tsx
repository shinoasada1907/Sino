import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { liveObjectUrls } from '@/test/objectUrls'
import { STICKER_MAX_BYTES } from '../format'
import { useBatch } from './useBatch'

// SP-08: the pictures of one "Thêm sticker" step (spec sticker-upload-editor). Each has a preview address of its own,
// which is let go when the picture leaves the batch and when the step closes (the hint of the task).

/** `size` bytes that start like a file of that type: enough for the batch to tell what it is. */
const bytes = (head: number[], size: number) => {
  const content = new Uint8Array(Math.max(size, head.length))
  content.set(head)
  return content
}
const png = (name: string) => new File([bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 8)], name, { type: 'image/png' })
const gif = (name: string, size = 10) => new File([bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], size)], name, { type: 'image/gif' })
const jpeg = (name: string) => new File([bytes([0xff, 0xd8, 0xff, 0xe0], 4)], name, { type: 'image/jpeg' })
const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' })

const names = (batch: ReturnType<typeof useBatch>) => batch.items.map((item) => item.file.name)

async function setup(...files: File[]) {
  const hook = renderHook(() => useBatch())
  if (files.length > 0) {
    await act(() => hook.result.current.add(files))
  }
  return hook
}

describe('useBatch (SP-08)', () => {
  it('is closed and empty until files come', async () => {
    const { result } = await setup()

    expect(result.current.open).toBe(false)
    expect(result.current.items).toEqual([])
  })

  it('opens with the pictures in the order chosen, the first one selected, each named after its file', async () => {
    const { result } = await setup(jpeg('meo.jpg'), png('cho.png'), gif('nhay.gif'))

    expect(result.current.open).toBe(true)
    expect(names(result.current)).toEqual(['meo.jpg', 'cho.png', 'nhay.gif'])
    expect(result.current.items.map((item) => item.name)).toEqual(['meo', 'cho', 'nhay'])
    expect(result.current.items.map((item) => item.kind.editing)).toEqual(['crop', 'crop', 'whole'])
    expect(result.current.selected?.file.name).toBe('meo.jpg')
    expect(liveObjectUrls()).toHaveLength(3)
    expect(result.current.items.map((item) => item.previewUrl)).toEqual(liveObjectUrls())
  })

  it('keeps out what it refuses, with the reason and the name of the file, and makes it no preview', async () => {
    const { result } = await setup(pdf('ghi-chu.pdf'), png('meo.png'), gif('nang.gif', STICKER_MAX_BYTES + 1))

    expect(names(result.current)).toEqual(['meo.png'])
    expect(result.current.refusals.map((refusal) => [refusal.fileName, refusal.reason])).toEqual([
      ['ghi-chu.pdf', 'Không phải ảnh dùng được: chỉ nhận PNG, JPEG, GIF, WebP.'],
      ['nang.gif', 'Ảnh động nặng hơn 1 MB. Ảnh động được lưu nguyên, nên hãy chọn tệp nhẹ hơn.'],
    ])
    expect(liveObjectUrls()).toHaveLength(1)
  })

  it('does not open for a choice it refuses all of, and still says why', async () => {
    const { result } = await setup(pdf('ghi-chu.pdf'))

    expect(result.current.open).toBe(false)
    expect(result.current.refusals).toHaveLength(1)
  })

  it('adds a later choice after the pictures it has, keeps the one selected, and forgets the refusals of the last choice', async () => {
    const { result } = await setup(png('meo.png'), pdf('ghi-chu.pdf'))
    act(() => result.current.select(result.current.items[0].id))

    await act(() => result.current.add([gif('nhay.gif')]))

    expect(names(result.current)).toEqual(['meo.png', 'nhay.gif'])
    expect(result.current.selected?.file.name).toBe('meo.png')
    expect(result.current.refusals).toEqual([])
  })

  it('selects a picture', async () => {
    const { result } = await setup(png('meo.png'), png('cho.png'))

    act(() => result.current.select(result.current.items[1].id))

    expect(result.current.selected?.file.name).toBe('cho.png')
  })

  it('takes a picture out, lets its preview go, and selects the next one, or the one before the last', async () => {
    const { result } = await setup(png('a.png'), png('b.png'), png('c.png'))
    const [a, b, c] = result.current.items

    act(() => result.current.remove(a.id))
    expect(names(result.current)).toEqual(['b.png', 'c.png'])
    expect(result.current.selected?.id).toBe(b.id)
    expect(liveObjectUrls()).not.toContain(a.previewUrl)

    act(() => result.current.select(c.id))
    act(() => result.current.remove(c.id))
    expect(result.current.selected?.id).toBe(b.id)

    act(() => result.current.remove(b.id))
    expect(result.current.items).toEqual([])
    expect(result.current.selectedId).toBeNull()
    // Still open: the owner may add other pictures.
    expect(result.current.open).toBe(true)
    expect(liveObjectUrls()).toEqual([])
  })

  it('keeps the selection when another picture is taken out', async () => {
    const { result } = await setup(png('a.png'), png('b.png'))
    const [a, b] = result.current.items

    act(() => result.current.remove(b.id))

    expect(result.current.selected?.id).toBe(a.id)
  })

  it('takes the sent pictures out at once, and marks one that could not be read', async () => {
    const { result } = await setup(png('a.png'), png('b.png'), png('c.png'))
    const [a, b, c] = result.current.items

    act(() => {
      result.current.take([a.id, c.id])
      result.current.setProblem(b.id, 'Không đọc được ảnh này.')
    })

    expect(names(result.current)).toEqual(['b.png'])
    expect(result.current.items[0].problem).toBe('Không đọc được ảnh này.')
    expect(liveObjectUrls()).toEqual([b.previewUrl])
  })

  it('lets every preview go and forgets everything when the step closes', async () => {
    const { result } = await setup(png('a.png'), png('b.png'), pdf('x.pdf'))

    act(() => result.current.close())

    expect(result.current.open).toBe(false)
    expect(result.current.items).toEqual([])
    expect(result.current.refusals).toEqual([])
    expect(liveObjectUrls()).toEqual([])
  })

  it('lets the previews go when the screen goes away with the step open', async () => {
    const { unmount } = await setup(png('a.png'), png('b.png'))

    unmount()

    expect(liveObjectUrls()).toEqual([])
  })

  it('forgets the refusals when asked', async () => {
    const { result } = await setup(pdf('x.pdf'))

    act(() => result.current.dismissRefusals())

    expect(result.current.refusals).toEqual([])
  })

  it('keeps what was done to each picture by its id, through other changes to the batch (SP-09)', async () => {
    const { result } = await setup(png('a.png'), png('b.png'), png('c.png'))
    const [a, b, c] = result.current.items

    act(() => {
      result.current.edit(b.id, { rotation: 90, zoom: 2 })
      result.current.rename(b.id, 'Bé mèo')
    })
    act(() => result.current.remove(a.id))
    act(() => result.current.select(c.id))

    const kept = result.current.items.find((item) => item.id === b.id)
    expect(kept?.edit).toMatchObject({ rotation: 90, zoom: 2, shape: 'square' })
    expect(kept?.name).toBe('Bé mèo')
    expect(result.current.items.find((item) => item.id === c.id)?.edit).toEqual({ crop: { x: 0, y: 0 }, zoom: 1, rotation: 0, shape: 'square', area: null })
  })
})
