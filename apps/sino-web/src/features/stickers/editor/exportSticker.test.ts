import { describe, expect, it } from 'vitest'
import { FakeCanvas, landsAt } from '@/test/fakeCanvas'
import { STICKER_MAX_BYTES } from '../format'
import { exportSticker, EXPORT_MAX_SIDE, outputSize } from './exportSticker'

// SP-07, D-345: the picture as the owner framed it, drawn again by the browser into a PNG (spec sticker-upload-editor,
// "Chỉnh một ảnh tĩnh trước khi lưu"). The canvas is a fake that keeps the transform, so the geometry can be checked here.

// The fake canvas only keeps what it is given to draw, so anything stands for the decoded picture.
const picture = (width: number, height: number) => ({ source: { picture: `${width}x${height}` } as unknown as CanvasImageSource, width, height })

/** Exports with a fake canvas whose PNG weighs `bytesFor(width, height)`, and gives back the canvas and the blob. */
async function run(width: number, height: number, area: { x: number; y: number; width: number; height: number }, rotation: 0 | 90 | 180 | 270 = 0, bytesFor?: (w: number, h: number) => number | null) {
  const canvases: FakeCanvas[] = []
  const blob = await exportSticker(picture(width, height), area, rotation, {
    createCanvas: () => {
      const canvas = new FakeCanvas(bytesFor)
      canvases.push(canvas)
      return canvas as unknown as HTMLCanvasElement
    },
  })
  return { blob, canvas: canvases.at(-1)!, canvases }
}

// Rounded to a thousandth, and `+ 0` makes the -0 that a turn can leave a plain 0.
const near = ([x, y]: [number, number]) => [Math.round(x * 1000) / 1000 + 0, Math.round(y * 1000) / 1000 + 0]

describe('outputSize: the size of the PNG (D-345)', () => {
  it('brings the longest side down to 512 and keeps the shape', () => {
    expect(outputSize(1000, 1000)).toEqual({ width: 512, height: 512 })
    expect(outputSize(800, 400)).toEqual({ width: 512, height: 256 })
    expect(outputSize(400, 2000)).toEqual({ width: 102, height: 512 })
  })

  it('never makes a small area bigger', () => {
    expect(outputSize(300, 300)).toEqual({ width: 300, height: 300 })
    expect(outputSize(512, 100)).toEqual({ width: 512, height: 100 })
    expect(outputSize(1, 1)).toEqual({ width: 1, height: 1 })
  })

  it('keeps at least one pixel on each side of a thin strip', () => {
    expect(outputSize(5000, 3)).toEqual({ width: 512, height: 1 })
  })

  it('works from a fraction of the area that react-easy-crop gives', () => {
    expect(outputSize(299.6, 300.4)).toEqual({ width: 300, height: 300 })
  })

  it('is 512 at most', () => {
    expect(EXPORT_MAX_SIDE).toBe(512)
  })
})

describe('exportSticker: what the browser sends after the edit step (SP-07, D-345)', () => {
  it('sends the middle square of a 2000 × 1000 picture as a 512 × 512 PNG', async () => {
    const { blob, canvas } = await run(2000, 1000, { x: 500, y: 0, width: 1000, height: 1000 })

    expect(blob.type).toBe('image/png')
    expect(canvas.blobs).toEqual([{ width: 512, height: 512, type: 'image/png' }])
    const [drawing] = canvas.context.drawings
    expect(drawing.args).toEqual([0, 0, 2000, 1000])
    // The corners of the area are the corners of the PNG; the rest of the picture falls outside.
    expect(near(landsAt(drawing, 500, 0))).toEqual([0, 0])
    expect(near(landsAt(drawing, 1500, 1000))).toEqual([512, 512])
    expect(near(landsAt(drawing, 0, 0))).toEqual([-256, 0])
  })

  it('keeps a 300 × 300 area at 300 × 300, pixel for pixel', async () => {
    const { canvas } = await run(2000, 1000, { x: 100, y: 200, width: 300, height: 300 })

    expect(canvas.blobs[0]).toMatchObject({ width: 300, height: 300 })
    const [drawing] = canvas.context.drawings
    expect(near(landsAt(drawing, 100, 200))).toEqual([0, 0])
    expect(near(landsAt(drawing, 400, 500))).toEqual([300, 300])
  })

  it('draws smoothly, as a picture made smaller should be', async () => {
    const { canvas } = await run(2000, 1000, { x: 500, y: 0, width: 1000, height: 1000 })

    expect(canvas.context.imageSmoothingEnabled).toBe(true)
    expect(canvas.context.imageSmoothingQuality).toBe('high')
  })

  // react-easy-crop gives the area on the picture as it shows turned: a turned picture of 200 × 100 is 100 × 200.
  it('turns a 200 × 100 picture a quarter clockwise into a 100 × 200 PNG: the top left corner goes to the top right', async () => {
    const { canvas } = await run(200, 100, { x: 0, y: 0, width: 100, height: 200 }, 90)

    expect(canvas.blobs[0]).toMatchObject({ width: 100, height: 200 })
    const [drawing] = canvas.context.drawings
    expect(near(landsAt(drawing, 0, 0))).toEqual([100, 0])
    expect(near(landsAt(drawing, 200, 0))).toEqual([100, 200])
    expect(near(landsAt(drawing, 0, 100))).toEqual([0, 0])
  })

  it('turns it upside down at 180°, and a quarter the other way at 270°', async () => {
    const half = (await run(200, 100, { x: 0, y: 0, width: 200, height: 100 }, 180)).canvas
    expect(half.blobs[0]).toMatchObject({ width: 200, height: 100 })
    expect(near(landsAt(half.context.drawings[0], 0, 0))).toEqual([200, 100])

    const back = (await run(200, 100, { x: 0, y: 0, width: 100, height: 200 }, 270)).canvas
    expect(back.blobs[0]).toMatchObject({ width: 100, height: 200 })
    expect(near(landsAt(back.context.drawings[0], 0, 0))).toEqual([0, 200])
    expect(near(landsAt(back.context.drawings[0], 200, 0))).toEqual([0, 0])
  })

  it('takes the area out of the turned picture: the bottom half of a turned 200 × 100 is the right half of the picture', async () => {
    const { canvas } = await run(200, 100, { x: 0, y: 100, width: 100, height: 100 }, 90)

    const [drawing] = canvas.context.drawings
    // Turned a quarter clockwise, the right half of the picture (100..200, 0..100) is the bottom of the turned one.
    expect(near(landsAt(drawing, 100, 100))).toEqual([0, 0])
    expect(near(landsAt(drawing, 100, 0))).toEqual([100, 0])
    expect(near(landsAt(drawing, 200, 0))).toEqual([100, 100])
    expect(near(landsAt(drawing, 200, 100))).toEqual([0, 100])
  })

  it('makes the PNG smaller by steps of 0.8 until it weighs no more than 1 MB', async () => {
    // As heavy as raw pixels and a bit more: 512 × 512 is over the limit, 410 × 410 under it.
    const { blob, canvases } = await run(2000, 2000, { x: 0, y: 0, width: 2000, height: 2000 }, 0, (w, h) => w * h * 5)

    expect(canvases.map((canvas) => [canvas.width, canvas.height])).toEqual([
      [512, 512],
      [410, 410],
    ])
    expect(blob.size).toBe(410 * 410 * 5)
    expect(blob.size).toBeLessThanOrEqual(STICKER_MAX_BYTES)
  })

  it('takes a PNG that weighs exactly the limit as it is', async () => {
    const { canvases } = await run(1000, 1000, { x: 0, y: 0, width: 1000, height: 1000 }, 0, () => STICKER_MAX_BYTES)

    expect(canvases).toHaveLength(1)
  })

  it('gives up with an error when even a small PNG stays over the limit', async () => {
    await expect(run(1000, 1000, { x: 0, y: 0, width: 1000, height: 1000 }, 0, () => STICKER_MAX_BYTES + 1)).rejects.toThrow(/over/)
  })

  it('fails when the browser makes no PNG', async () => {
    await expect(run(1000, 1000, { x: 0, y: 0, width: 1000, height: 1000 }, 0, () => null)).rejects.toThrow(/PNG/)
  })
})
