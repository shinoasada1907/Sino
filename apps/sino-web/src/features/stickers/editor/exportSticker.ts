import type { Area } from 'react-easy-crop'
import { STICKER_MAX_BYTES } from '../format'

/** D-345: the longest side of an exported sticker, in pixels. A smaller area keeps its own size. */
export const EXPORT_MAX_SIDE = 512
/** How much smaller each new try is when the PNG weighs more than the limit. */
const SHRINK_STEP = 0.8
/** Below this longest side a PNG still over the limit is not worth trying smaller: the export fails instead. */
const SMALLEST_SIDE = 16

/** A quarter turn clockwise, as the edit step turns a picture (spec sticker-upload-editor). */
export type QuarterTurn = 0 | 90 | 180 | 270

/** The decoded picture: what to draw (an `<img>` that has loaded, or an `ImageBitmap`) and its own size in pixels. */
export interface Picture {
  source: CanvasImageSource
  width: number
  height: number
}

export interface ExportOptions {
  /** Makes the canvas to draw on; a seam for the tests, since jsdom has none that draws. */
  createCanvas?: () => HTMLCanvasElement
  maxBytes?: number
}

/** The size of the PNG for an area: its longest side brought down to 512 when longer, never up; one pixel at least. */
export function outputSize(width: number, height: number, scale = Math.min(1, EXPORT_MAX_SIDE / Math.max(width, height))) {
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * The PNG of what the owner framed (D-345): `area` is react-easy-crop's `croppedAreaPixels`, in pixels of the picture as
 * it shows turned by `rotation`. Drawn in one go on one canvas: the canvas is scaled to the size of the PNG and moved to
 * the area, then the picture is turned about the centre of its turned box (whose sides swap for a quarter turn) and drawn.
 * A PNG over 1 MB (a photo of many details) is drawn again 0.8 times smaller until it is not.
 *
 * @throws Error when the browser makes no PNG, or the PNG stays over the limit even small
 */
export async function exportSticker(picture: Picture, area: Area, rotation: QuarterTurn, options: ExportOptions = {}): Promise<Blob> {
  const createCanvas = options.createCanvas ?? (() => document.createElement('canvas'))
  const maxBytes = options.maxBytes ?? STICKER_MAX_BYTES
  let scale = Math.min(1, EXPORT_MAX_SIDE / Math.max(area.width, area.height))
  for (;;) {
    const size = outputSize(area.width, area.height, scale)
    const png = await draw(createCanvas(), picture, area, rotation, size)
    if (png.size <= maxBytes) {
      return png
    }
    if (Math.max(size.width, size.height) <= SMALLEST_SIDE) {
      throw new Error(`The PNG stays over ${maxBytes} bytes even at ${size.width} × ${size.height}.`)
    }
    scale *= SHRINK_STEP
  }
}

async function draw(canvas: HTMLCanvasElement, picture: Picture, area: Area, rotation: QuarterTurn, size: { width: number; height: number }) {
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('The browser gives no 2D canvas to make the PNG on.')
  }
  const sideways = rotation === 90 || rotation === 270
  const turnedWidth = sideways ? picture.height : picture.width
  const turnedHeight = sideways ? picture.width : picture.height
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  // Read from the last line up: the picture is centred on the origin, turned, put in its turned box, the area moved to the
  // corner of the canvas, and all of it scaled to the size of the PNG.
  context.scale(size.width / area.width, size.height / area.height)
  context.translate(-area.x, -area.y)
  context.translate(turnedWidth / 2, turnedHeight / 2)
  context.rotate((rotation * Math.PI) / 180)
  context.translate(-picture.width / 2, -picture.height / 2)
  context.drawImage(picture.source, 0, 0, picture.width, picture.height)
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!png) {
    throw new Error('The browser made no PNG of the canvas.')
  }
  return png
}
