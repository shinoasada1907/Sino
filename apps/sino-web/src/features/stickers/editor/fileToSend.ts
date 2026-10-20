import type { PictureKind } from './editable'
import { exportSticker, type ExportOptions } from './exportSticker'
import { DEFAULT_EDIT, defaultArea, type PictureEdit } from './pictureEdit'

/** A picture of the batch, as much as it takes to know what to send. */
export interface SendableItem {
  file: File
  /** The name of the sticker, which the PNG is named after too; blank names the PNG after the file. */
  name: string
  kind: PictureKind
  /** What the owner did to it in the editor (SP-09); none is the default frame. */
  edit?: PictureEdit
}

export interface SendOptions extends ExportOptions {
  /** Decodes the file; `createImageBitmap` turns a photo upright by its EXIF orientation, as an `<img>` does. */
  decode?: (file: File) => Promise<ImageBitmap>
}

// "meo.vui.jpg" → "meo.vui".
const stemOf = (fileName: string) => {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/**
 * The file to send for a picture of the batch: a moving one as the very file, so that it keeps moving (D-346); a still one
 * as the PNG of what the owner framed, turned as the owner turned it (D-345, SP-09), or of the default frame when the
 * picture was never opened in the editor.
 *
 * @throws when the browser cannot decode the picture or make the PNG
 */
export async function fileToSend(item: SendableItem, options: SendOptions = {}): Promise<File> {
  if (item.kind.editing === 'whole') {
    return item.file
  }
  const decode = options.decode ?? ((file: File) => createImageBitmap(file))
  const edit = item.edit ?? DEFAULT_EDIT
  const bitmap = await decode(item.file)
  try {
    const png = await exportSticker({ source: bitmap, width: bitmap.width, height: bitmap.height }, defaultArea(bitmap.width, bitmap.height, edit), edit.rotation, options)
    return new File([png], `${item.name.trim() || stemOf(item.file.name)}.png`, { type: 'image/png' })
  } finally {
    // A decoded photo holds its pixels until let go.
    bitmap.close()
  }
}
