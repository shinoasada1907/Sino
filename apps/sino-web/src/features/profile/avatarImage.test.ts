import { describe, expect, it } from 'vitest'
import { FakeCanvas, landsAt } from '@/test/fakeCanvas'
import { AVATAR_SIZE, canDecode, defaultArea, looksLikeImage, makeAvatar, turnedQuarter } from './avatarImage'

describe('defaultArea', () => {
  it('is the biggest square in the middle of a landscape or a portrait picture', () => {
    expect(defaultArea(4000, 3000)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 })
    expect(defaultArea(3000, 4000)).toEqual({ x: 0, y: 500, width: 3000, height: 3000 })
  })

  it('keeps a square whole and rounds the corner down for an odd difference', () => {
    expect(defaultArea(500, 500)).toEqual({ x: 0, y: 0, width: 500, height: 500 })
    expect(defaultArea(101, 100)).toEqual({ x: 0, y: 0, width: 100, height: 100 })
    expect(defaultArea(100, 103)).toEqual({ x: 0, y: 1, width: 100, height: 100 })
  })

  it('is measured on the turned picture: a quarter turn swaps its sides', () => {
    expect(defaultArea(4000, 3000, 90)).toEqual({ x: 0, y: 500, width: 3000, height: 3000 })
    expect(defaultArea(4000, 3000, 180)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 })
  })
})

describe('turnedQuarter', () => {
  it('goes clockwise and four turns make none', () => {
    expect(turnedQuarter(0)).toBe(90)
    expect(turnedQuarter(270)).toBe(0)
  })
})

describe('looksLikeImage', () => {
  it('goes by the type of the file', () => {
    expect(looksLikeImage(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(true)
    expect(looksLikeImage(new File(['x'], 'a.png', { type: 'text/plain' }))).toBe(false)
    expect(looksLikeImage(new File(['x'], 'a', { type: '' }))).toBe(false)
  })
})

describe('makeAvatar', () => {
  const corners = (canvas: FakeCanvas, width: number, height: number) => {
    const drawing = canvas.context.drawings[0]
    return [landsAt(drawing, 0, 0), landsAt(drawing, width, 0), landsAt(drawing, width, height), landsAt(drawing, 0, height)].map(([x, y]) => [Math.round(x), Math.round(y)])
  }

  const photo = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
  const decode = (width: number, height: number) => async () => ({ width, height, close: () => {} }) as ImageBitmap
  const canvasOf = (canvas: FakeCanvas) => () => canvas as unknown as HTMLCanvasElement

  it('draws the centre square of the picture onto 256 x 256 and sends WebP', async () => {
    const canvas = new FakeCanvas()
    const file = await makeAvatar(photo, { decode: decode(4000, 3000), createCanvas: canvasOf(canvas) })

    expect(canvas.blobs).toEqual([{ width: AVATAR_SIZE, height: AVATAR_SIZE, type: 'image/webp' }])
    const drawing = canvas.context.drawings[0]
    // The whole picture is drawn at (0, 0); the centre square (x 500..3500) is what lands on the canvas.
    expect(drawing.args).toEqual([0, 0, 4000, 3000])
    expect(landsAt(drawing, 500, 0).map(Math.round)).toEqual([0, 0])
    expect(landsAt(drawing, 3500, 3000).map(Math.round)).toEqual([AVATAR_SIZE, AVATAR_SIZE])
    expect(file.type).toBe('image/webp')
    expect(file.name).toBe('avatar.webp')
  })

  it('draws the area the frame measured, so the part on show is the part sent', async () => {
    const canvas = new FakeCanvas()
    await makeAvatar(photo, { decode: decode(4000, 3000), createCanvas: canvasOf(canvas), area: { x: 1000, y: 500, width: 1000, height: 1000 } })

    const drawing = canvas.context.drawings[0]
    expect(landsAt(drawing, 1000, 500).map(Math.round)).toEqual([0, 0])
    expect(landsAt(drawing, 2000, 1500).map(Math.round)).toEqual([AVATAR_SIZE, AVATAR_SIZE])
  })

  it('turns the picture a quarter clockwise before taking the area, in pixels of the turned picture', async () => {
    const canvas = new FakeCanvas()
    // 400 x 200 turned 90 degrees shows 200 x 400; its top 200 x 200 is the area.
    await makeAvatar(photo, { decode: decode(400, 200), createCanvas: canvasOf(canvas), rotation: 90, area: { x: 0, y: 0, width: 200, height: 200 } })

    // The corners of the picture land turned: its top-left goes to the top-right of the turned box.
    expect(corners(canvas, 400, 200)).toEqual([
      [AVATAR_SIZE, 0],
      [AVATAR_SIZE, 512],
      [0, 512],
      [0, 0],
    ])
  })

  it('ignores an area that was never measured (NaN) and takes the centre square', async () => {
    const canvas = new FakeCanvas()
    await makeAvatar(photo, { decode: decode(4000, 3000), createCanvas: canvasOf(canvas), area: { x: NaN, y: NaN, width: NaN, height: NaN } })

    expect(landsAt(canvas.context.drawings[0], 500, 0).map(Math.round)).toEqual([0, 0])
  })

  it('without an area takes the centre square of the turned picture', async () => {
    const canvas = new FakeCanvas()
    await makeAvatar(photo, { decode: decode(400, 200), createCanvas: canvasOf(canvas), rotation: 90 })

    // Turned: 200 x 400, centre square is y 100..300; the top-left of the picture lands at (256, -128).
    expect(landsAt(canvas.context.drawings[0], 0, 0).map(Math.round)).toEqual([AVATAR_SIZE, -128])
  })

  it('falls back to PNG when the browser answers with another type than WebP', async () => {
    const canvas = new FakeCanvas()
    // A browser without WebP output hands back a PNG whatever type was asked for.
    canvas.toBlob = (callback) => {
      canvas.blobs.push({ width: canvas.width, height: canvas.height, type: 'asked' })
      queueMicrotask(() => callback(new Blob([new Uint8Array(10)], { type: 'image/png' })))
    }
    const file = await makeAvatar(photo, { decode: decode(300, 600), createCanvas: canvasOf(canvas) })

    expect(canvas.blobs).toHaveLength(2)
    expect(file.type).toBe('image/png')
    expect(file.name).toBe('avatar.png')
  })

  it('lets the decoded picture go, also when drawing fails', async () => {
    let closed = 0
    const bitmap = { width: 10, height: 10, close: () => closed++ } as ImageBitmap
    const noContext = () => ({ width: 0, height: 0, getContext: () => null }) as unknown as HTMLCanvasElement
    await expect(makeAvatar(photo, { decode: async () => bitmap, createCanvas: noContext })).rejects.toThrow()
    expect(closed).toBe(1)
  })

  it('fails when the browser cannot decode the file', async () => {
    await expect(makeAvatar(photo, { decode: () => Promise.reject(new Error('bad')) })).rejects.toThrow('bad')
  })
})

describe('canDecode', () => {
  it('says whether the browser can read the file, and lets the bitmap go', async () => {
    let closed = 0
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    expect(await canDecode(file, async () => ({ width: 1, height: 1, close: () => closed++ }) as ImageBitmap)).toBe(true)
    expect(closed).toBe(1)
    expect(await canDecode(file, () => Promise.reject(new Error('bad')))).toBe(false)
  })
})
