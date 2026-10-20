import type { Area } from 'react-easy-crop'
import type { PictureKind } from './editable'
import { exportSticker, type ExportOptions } from './exportSticker'

/** A picture of the batch, as much as it takes to know what to send. */
export interface SendableItem {
  file: File
  /** The name of the sticker; the PNG is named after it, and the server names a sticker by its file. */
  name: string
  kind: PictureKind
}

export interface SendOptions extends ExportOptions {
  /** Decodes the file; `createImageBitmap` turns a photo upright by its EXIF orientation, as an `<img>` does. */
  decode?: (file: File) => Promise<ImageBitmap>
}

/** The default frame of the edit step: the largest square in the middle of the picture (spec sticker-upload-editor). */
export function centredSquare(width: number, height: number): Area {
  const side = Math.min(width, height)
  return { x: (width - side) / 2, y: (height - side) / 2, width: side, height: side }
}

/**
 * The file to send for a picture of the batch: a moving one as the very file, so that it keeps moving (D-346); a still one
 * as the PNG of its default frame (D-345), until the frame of the edit step (SP-09) says otherwise.
 *
 * @throws when the browser cannot decode the picture or make the PNG
 */
export async function fileToSend(item: SendableItem, options: SendOptions = {}): Promise<File> {
  if (item.kind.editing === 'whole') {
    return item.file
  }
  const decode = options.decode ?? ((file: File) => createImageBitmap(file))
  const bitmap = await decode(item.file)
  try {
    const png = await exportSticker({ source: bitmap, width: bitmap.width, height: bitmap.height }, centredSquare(bitmap.width, bitmap.height), 0, options)
    return new File([png], `${item.name}.png`, { type: 'image/png' })
  } finally {
    // A decoded photo holds its pixels until let go.
    bitmap.close()
  }
}
