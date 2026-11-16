/** The profile picture is sent as a square of this many pixels a side (profile-info D-477). */
export const AVATAR_SIZE = 256

/** A quarter turn clockwise, as the frame turns the picture. */
export type QuarterTurn = 0 | 90 | 180 | 270

/** A quarter turn more, clockwise; four make none. */
export const turnedQuarter = (rotation: QuarterTurn): QuarterTurn => ((rotation + 90) % 360) as QuarterTurn

/** The part of the picture that becomes the avatar, in pixels of the picture as it shows turned (react-easy-crop's `croppedAreaPixels`). */
export interface AvatarArea {
  x: number
  y: number
  width: number
  height: number
}

/** The sides of a picture as it shows turned: a quarter turn swaps them. */
const turned = (width: number, height: number, rotation: QuarterTurn) => (rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height })

/** An area measured before the picture had a size (react-easy-crop then reports NaN) cannot be drawn. */
const isUsable = (area: AvatarArea) => [area.x, area.y, area.width, area.height].every(Number.isFinite) && area.width > 0 && area.height > 0

/** What the frame holds before the owner touches it: the biggest square in the middle of the turned picture. */
export function defaultArea(width: number, height: number, rotation: QuarterTurn = 0): AvatarArea {
  const box = turned(width, height, rotation)
  const side = Math.min(box.width, box.height)
  return { x: Math.floor((box.width - side) / 2), y: Math.floor((box.height - side) / 2), width: side, height: side }
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 3

/** What the owner did to the picture in the frame of "Đổi ảnh đại diện" (profile-info PI-05). */
export interface AvatarEdit {
  crop: { x: number; y: number }
  /** From 1 to 3. */
  zoom: number
  rotation: QuarterTurn
  /** The frame in pixels of the turned picture, as react-easy-crop last measured it; `null` until it has. */
  area: AvatarArea | null
}

export const INITIAL_EDIT: AvatarEdit = { crop: { x: 0, y: 0 }, zoom: MIN_ZOOM, rotation: 0, area: null }

/** A cheap check before decoding: the browser only gets files that say they are pictures. */
export const looksLikeImage = (file: File) => file.type.startsWith('image/')

export interface AvatarOptions {
  /** The part to keep, as the frame measured it; the centre square when the frame was never touched. */
  area?: AvatarArea
  /** How far the frame has turned the picture, clockwise. */
  rotation?: QuarterTurn
  /** Decodes the file; `createImageBitmap` turns a photo upright by its EXIF orientation. */
  decode?: (file: File) => Promise<ImageBitmap>
  /** Makes the drawing surface; a test hands in a fake one. */
  createCanvas?: () => HTMLCanvasElement
}

const toBlob = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type))

/**
 * The file to send: the framed part of the picture (the centre square when nothing was framed), turned by `rotation`, scaled
 * to 256 x 256, as WebP (PNG when the browser cannot make WebP: it then answers with another type, usually PNG).
 *
 * @throws when the browser cannot decode the file or draw it
 */
export async function makeAvatar(file: File, options: AvatarOptions = {}): Promise<File> {
  const decode = options.decode ?? ((source: File) => createImageBitmap(source))
  const bitmap = await decode(file)
  try {
    const canvas = options.createCanvas ? options.createCanvas() : document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('No 2D canvas')
    }
    const rotation = options.rotation ?? 0
    const area = options.area && isUsable(options.area) ? options.area : defaultArea(bitmap.width, bitmap.height, rotation)
    const box = turned(bitmap.width, bitmap.height, rotation)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    // Read from the last line up (as the sticker export does): the picture is centred on the origin, turned, put in its
    // turned box, the area moved to the corner of the canvas, and all of it scaled to 256 x 256.
    context.scale(AVATAR_SIZE / area.width, AVATAR_SIZE / area.height)
    context.translate(-area.x, -area.y)
    context.translate(box.width / 2, box.height / 2)
    context.rotate((rotation * Math.PI) / 180)
    context.translate(-bitmap.width / 2, -bitmap.height / 2)
    context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height)

    let blob = await toBlob(canvas, 'image/webp')
    if (blob?.type !== 'image/webp') {
      blob = await toBlob(canvas, 'image/png')
    }
    if (!blob) {
      throw new Error('The canvas gave no picture')
    }
    return new File([blob], blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.png', { type: blob.type })
  } finally {
    bitmap.close()
  }
}

/** Whether the browser can decode the file as a picture; the frame is only shown for one that it can. */
export async function canDecode(file: File, decode: (source: File) => Promise<ImageBitmap> = (source) => createImageBitmap(source)): Promise<boolean> {
  try {
    ;(await decode(file)).close()
    return true
  } catch {
    return false
  }
}
