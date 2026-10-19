// What the Sticker screen can tell about a file before the server sees it (spec web-sticker-library). The server is the one
// that decides in the end: it reads the content, not the name or the type the browser claims.

/** DN-1: 1 MiB a file, the same number as `sino.stickers.max-file-size` of the API (its default); the server still checks. */
export const STICKER_MAX_BYTES = 1_048_576
/** The limit as people read it. */
export const STICKER_LIMIT_LABEL = '1 MB'
/** The types of picture the library takes (D-329). */
export const STICKER_TYPES = ['image/png', 'image/gif', 'image/webp']

const TYPE_OF_EXTENSION: Record<string, string> = { png: 'image/png', gif: 'image/gif', webp: 'image/webp' }

export type FileCheck = { ok: true } | { ok: false; reason: string }

// "meo.png" → "png"; a name with no dot has none.
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Whether a file may be sent: a PNG, GIF or WebP (by its type, or by its extension when the browser gives no type), not
 * empty, not over the limit. The type goes first: a smaller JPEG is still refused, so telling it is too big would mislead.
 * The reason is a sentence for the screen, without the name of the file (the screen adds it).
 */
export function checkStickerFile(file: Pick<File, 'name' | 'type' | 'size'>): FileCheck {
  const type = file.type !== '' ? file.type : (TYPE_OF_EXTENSION[extensionOf(file.name)] ?? '')
  if (!STICKER_TYPES.includes(type)) {
    return { ok: false, reason: 'Chỉ nhận PNG, GIF, WebP.' }
  }
  if (file.size === 0) {
    return { ok: false, reason: 'Tệp này trống.' }
  }
  if (file.size > STICKER_MAX_BYTES) {
    return { ok: false, reason: `Tệp nặng hơn ${STICKER_LIMIT_LABEL}; hãy chọn ảnh nhẹ hơn.` }
  }
  return { ok: true }
}

/** The sentence for a refusal of the server or of the network (ST-14 gives each code its own). */
export function uploadErrorMessage(_error: unknown): string {
  return 'Không tải lên được. Hãy thử lại.'
}
