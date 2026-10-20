import type { Area, Point } from 'react-easy-crop'
import type { QuarterTurn } from './exportSticker'

/**
 * The shape of the frame (spec sticker-upload-editor): a square, or the shape of the picture as it shows turned.
 * react-easy-crop has a frame of one fixed aspect that cannot be stretched by hand, so "free" is the picture's own shape.
 */
export type FrameShape = 'square' | 'picture'

/** What the owner did to one still picture of the batch (SP-09), kept with the picture so it never moves to another one. */
export interface PictureEdit {
  /** Where react-easy-crop has moved the picture under the frame, in pixels of its box. */
  crop: Point
  /** From 1 to 3. */
  zoom: number
  rotation: QuarterTurn
  shape: FrameShape
  /** The frame in pixels of the turned picture, as react-easy-crop last measured it; `null` until it has. */
  area: Area | null
}

/** The spec's default: the largest square in the middle, not zoomed, not turned. */
export const DEFAULT_EDIT: PictureEdit = { crop: { x: 0, y: 0 }, zoom: 1, rotation: 0, shape: 'square', area: null }

export const MIN_ZOOM = 1
export const MAX_ZOOM = 3

/** A quarter turn more, clockwise; four make none. */
export const turnedQuarter = (rotation: QuarterTurn): QuarterTurn => ((rotation + 90) % 360) as QuarterTurn

/** The sides of a picture as it shows turned: a quarter turn swaps them. */
export function turned(width: number, height: number, rotation: QuarterTurn) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height }
}

/** The aspect of the frame for the cropper; a square while the size of the picture is not known yet. */
export function frameAspect(edit: PictureEdit, width: number, height: number): number {
  if (edit.shape === 'square' || width <= 0 || height <= 0) {
    return 1
  }
  const box = turned(width, height, edit.rotation)
  return box.width / box.height
}

/**
 * The frame to send: the one react-easy-crop measured, or, for a picture the owner never opened in the editor, what it
 * would have measured at the start: the largest square in the middle of the turned picture, or all of it.
 */
export function defaultArea(width: number, height: number, edit: PictureEdit): Area {
  if (edit.area) {
    return edit.area
  }
  const box = turned(width, height, edit.rotation)
  if (edit.shape === 'picture') {
    return { x: 0, y: 0, width: box.width, height: box.height }
  }
  const side = Math.min(box.width, box.height)
  return { x: (box.width - side) / 2, y: (box.height - side) / 2, width: side, height: side }
}
