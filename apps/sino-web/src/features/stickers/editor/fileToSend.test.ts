import { describe, expect, it, vi } from 'vitest'
import { FakeCanvas, landsAt } from '@/test/fakeCanvas'
import { fileToSend } from './fileToSend'
import { DEFAULT_EDIT } from './pictureEdit'

// SP-08: what goes to the server for each picture of the batch until it is framed by hand (SP-09): a moving picture as
// the very file; a still one as a PNG of the largest square in its middle, the default frame of the spec.

const file = (name: string, type = 'image/png') => new File([new Uint8Array([1, 2, 3])], name, { type })

/** A decoder that sees every picture as `width` × `height`, and a canvas that is a fake; both kept to look at. */
function seams(width: number, height: number) {
  const bitmap = { width, height, close: vi.fn() }
  const canvases: FakeCanvas[] = []
  return {
    bitmap,
    canvases,
    options: {
      decode: vi.fn(async () => bitmap as unknown as ImageBitmap),
      createCanvas: () => {
        const canvas = new FakeCanvas()
        canvases.push(canvas)
        return canvas as unknown as HTMLCanvasElement
      },
    },
  }
}

describe('fileToSend (SP-08)', () => {
  it('sends a moving picture as the very file, without decoding it', async () => {
    const gif = file('nhay.gif', 'image/gif')
    const { options } = seams(100, 100)

    expect(await fileToSend({ file: gif, name: 'nhay', kind: { mediaType: 'image/gif', editing: 'whole' } }, options)).toBe(gif)
    expect(options.decode).not.toHaveBeenCalled()
  })

  it('sends a still picture as a PNG of its middle square, named after the sticker', async () => {
    const { options, canvases, bitmap } = seams(2000, 1000)

    const sent = await fileToSend({ file: file('meo.jpg', 'image/jpeg'), name: 'Mèo vui', kind: { mediaType: 'image/jpeg', editing: 'crop' } }, options)

    expect(sent.name).toBe('Mèo vui.png')
    expect(sent.type).toBe('image/png')
    expect(canvases[0].blobs[0]).toMatchObject({ width: 512, height: 512, type: 'image/png' })
    const [drawing] = canvases[0].context.drawings
    expect(drawing.source).toBe(bitmap)
    expect(landsAt(drawing, 500, 0)).toEqual([0, 0])
    // The decoded picture is let go once it is drawn.
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('lets the decoded picture go even when the export fails, and gives the failure to the caller', async () => {
    const { options, bitmap } = seams(100, 100)
    const failing = { ...options, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }

    await expect(fileToSend({ file: file('meo.png'), name: 'meo', kind: { mediaType: 'image/png', editing: 'crop' } }, failing)).rejects.toThrow()
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('fails when the browser cannot decode the picture', async () => {
    const decode = vi.fn(async () => {
      throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
    })

    await expect(fileToSend({ file: file('hong.png'), name: 'hong', kind: { mediaType: 'image/png', editing: 'crop' } }, { decode })).rejects.toThrow(/decoded/)
  })

  it('sends the area the owner framed, turned as the owner turned it (SP-09)', async () => {
    const { options, canvases } = seams(200, 100)
    const edit = { ...DEFAULT_EDIT, rotation: 90 as const, area: { x: 0, y: 100, width: 100, height: 100 } }

    await fileToSend({ file: file('meo.png'), name: 'meo', kind: { mediaType: 'image/png', editing: 'crop' }, edit }, options)

    expect(canvases[0].blobs[0]).toMatchObject({ width: 100, height: 100 })
    const [drawing] = canvases[0].context.drawings
    // Turned a quarter clockwise, the right half of the picture is the bottom of the turned one.
    expect(landsAt(drawing, 100, 100).map(Math.round)).toEqual([0, 0])
    expect(landsAt(drawing, 200, 0).map(Math.round)).toEqual([100, 100])
  })

  it('sends the whole picture, turned, when the frame has its shape and was not measured (SP-09)', async () => {
    const { options, canvases } = seams(2000, 1000)
    const edit = { ...DEFAULT_EDIT, rotation: 90 as const, shape: 'picture' as const }

    await fileToSend({ file: file('meo.png'), name: 'meo', kind: { mediaType: 'image/png', editing: 'crop' }, edit }, options)

    expect(canvases[0].blobs[0]).toMatchObject({ width: 256, height: 512 })
  })

  it('names the PNG after its file when the name is left blank, so the server falls back to it (SP-09)', async () => {
    const { options } = seams(100, 100)

    const sent = await fileToSend({ file: file('meo.jpg', 'image/jpeg'), name: '   ', kind: { mediaType: 'image/jpeg', editing: 'crop' } }, options)

    expect(sent.name).toBe('meo.png')
  })
})
