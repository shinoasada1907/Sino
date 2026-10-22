/**
 * The pictures and files sent from this page (zalo-send-files, D-378), by the `clientMessageId` of their message. The
 * bytes are not kept by Sino, so "Gửi lại" sends the `File` this page still holds; after the page is loaded again there
 * is none, and a failed one can only be thrown away. A picture's preview is made when first asked for and let go when
 * the conversation closes (`releasePreviews`) or the message is thrown away (`forget`); the file stays for a resend.
 */

/** What a picture may weigh, and any other file (D-371); the server checks again and decides the kind by the bytes. */
export const PICTURE_LIMIT_BYTES = 10 * 1024 * 1024
export const FILE_LIMIT_BYTES = 25 * 1024 * 1024

const PICTURE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** A picture by what the browser says of it; only to warn early and to show a preview. */
export const isPicture = (file: File) => PICTURE_TYPES.has(file.type)

/** Why a file cannot go, in Vietnamese, or null when it can. */
export function refusalOf(file: File): string | null {
  if (file.size === 0) {
    return 'Tệp rỗng.'
  }
  if (isPicture(file) ? file.size > PICTURE_LIMIT_BYTES : file.size > FILE_LIMIT_BYTES) {
    return isPicture(file) ? 'Ảnh lớn hơn 10 MB.' : 'Tệp lớn hơn 25 MB.'
  }
  return null
}

const files = new Map<string, File>()
const previews = new Map<string, string>()

export const outgoingFiles = {
  keep(clientMessageId: string, file: File) {
    files.set(clientMessageId, file)
  },
  fileOf: (clientMessageId: string) => files.get(clientMessageId),
  /** The address of the picture's preview, made once; null for a file that is no picture or not held here. */
  previewOf(clientMessageId: string): string | null {
    const file = files.get(clientMessageId)
    if (!file || !isPicture(file)) {
      return null
    }
    let url = previews.get(clientMessageId)
    if (!url) {
      url = URL.createObjectURL(file)
      previews.set(clientMessageId, url)
    }
    return url
  },
  forget(clientMessageId: string) {
    const url = previews.get(clientMessageId)
    if (url) {
      URL.revokeObjectURL(url)
    }
    previews.delete(clientMessageId)
    files.delete(clientMessageId)
  },
  releasePreviews() {
    previews.forEach((url) => URL.revokeObjectURL(url))
    previews.clear()
  },
}
