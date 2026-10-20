import { ApiError, NETWORK_ERROR } from '@/shared/api/problem'

// What the Sticker screen can tell about a file before the server sees it, and how it says what the server refused (spec
// web-sticker-library). The server is the one that decides in the end: it reads the content, not the name or the type the
// browser claims.

/** DN-1: 1 MiB a file, the same number as `sino.stickers.max-file-size` of the API (its default); the server still checks. */
export const STICKER_MAX_BYTES = 1_048_576
/** The limit as people read it. */
export const STICKER_LIMIT_LABEL = '1 MB'
/** DN-1: the longest side, and how many stickers a person may keep; the defaults of `sino.stickers.max-side` and `max-per-owner`. */
const DEFAULT_MAX_SIDE = 1024
const DEFAULT_MAX_PER_OWNER = 300
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

// 1572864 → "1,5 MB", 524288 → "512 KB".
function formatBytes(bytes: number): string {
  const mib = bytes / 1_048_576
  return mib >= 1 ? `${String(Math.round(mib * 10) / 10).replace('.', ',')} MB` : `${Math.round(bytes / 1024)} KB`
}

// A limit the server put in the problem (`maxBytes`, `maxSide`, `maxPerOwner`), when it is a positive number.
function limitOf(error: unknown, member: string): number | null {
  const value = error instanceof ApiError ? error.extra[member] : undefined
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/**
 * The sentence for what failed in an upload: the cause and what to do, never the code or the words of the server. A limit
 * the server names is the one said (it is a setting there); without one, ours (DN-1). A failure it does not know, and what
 * is not an `ApiError` at all, get a plain "try again".
 */
export function uploadErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : ''
  switch (code) {
    case 'STICKER_TYPE_UNSUPPORTED':
      return 'Chỉ nhận PNG, GIF, WebP.'
    case 'STICKER_TOO_LARGE':
    case 'PAYLOAD_TOO_LARGE': {
      const limit = limitOf(error, 'maxBytes')
      return `Tệp nặng hơn ${limit === null ? STICKER_LIMIT_LABEL : formatBytes(limit)}; hãy chọn ảnh nhẹ hơn.`
    }
    case 'STICKER_INVALID_IMAGE':
      return `Không đọc được ảnh này, hoặc có cạnh dài hơn ${limitOf(error, 'maxSide') ?? DEFAULT_MAX_SIDE} điểm ảnh. Hãy thử ảnh khác.`
    case 'STICKER_DUPLICATE':
      return 'Sticker này đã có trong thư viện.'
    case 'STICKER_LIMIT_REACHED':
      return `Thư viện đã đầy (tối đa ${limitOf(error, 'maxPerOwner') ?? DEFAULT_MAX_PER_OWNER} sticker). Hãy xóa bớt sticker rồi tải lại.`
    case 'STICKER_FILE_MISSING':
      return 'Tệp trống hoặc không gửi được. Hãy chọn lại tệp.'
    case NETWORK_ERROR:
      return 'Không kết nối được với máy chủ. Hãy kiểm tra mạng rồi thử lại.'
    default:
      return 'Không tải lên được. Hãy thử lại.'
  }
}

// The refusals that would come again for the same file; everything else (no network, a server that failed) may work the second time.
const FINAL_REFUSALS = new Set([
  'STICKER_TYPE_UNSUPPORTED',
  'STICKER_TOO_LARGE',
  'PAYLOAD_TOO_LARGE',
  'STICKER_INVALID_IMAGE',
  'STICKER_DUPLICATE',
  'STICKER_LIMIT_REACHED',
  'STICKER_FILE_MISSING',
])

/** Whether trying the same file again may work: a lost network or a failed server yes, a refusal of the file itself no. */
export function isRetryableUpload(error: unknown): boolean {
  return !(error instanceof ApiError && FINAL_REFUSALS.has(error.code))
}

/** The longest name of a pack, in characters as the server counts them (code points, so an emoji is one; D-344). */
const PACK_NAME_MAX = 50
/** As many packs as a person may have when the server does not say: the default of `sino.stickers.max-packs-per-owner`. */
const DEFAULT_MAX_PACKS = 50

/** The rule of a name, for the line under the field. */
export const PACK_NAME_RULE = `Tên bộ có từ 1 đến ${PACK_NAME_MAX} ký tự.`

/** Whether the server takes this as the name of a pack: 1 to 50 characters once the spaces around it are gone. */
export function isPackName(name: string): boolean {
  const length = [...name.trim()].length
  return length >= 1 && length <= PACK_NAME_MAX
}

const NETWORK_SENTENCE = 'Không kết nối được với máy chủ. Hãy kiểm tra mạng rồi thử lại.'
const PACK_GONE_SENTENCE = 'Bộ này không còn nữa. Có thể nó vừa bị xóa ở nơi khác.'

/** Why a pack was not created or renamed, with what to do; `name` is what the owner typed. */
export function packErrorMessage(error: unknown, name: string): string {
  const code = error instanceof ApiError ? error.code : ''
  switch (code) {
    case 'STICKER_PACK_NAME_TAKEN':
      return `Đã có bộ tên “${name.trim()}”. Hãy đặt tên khác.`
    case 'STICKER_PACK_LIMIT_REACHED':
      return `Bạn đã có đủ ${limitOf(error, 'maxPacks') ?? DEFAULT_MAX_PACKS} bộ. Hãy xóa bớt một bộ rồi tạo lại.`
    case 'STICKER_PACK_NOT_FOUND':
      return PACK_GONE_SENTENCE
    case 'VALIDATION_FAILED':
      return PACK_NAME_RULE
    case NETWORK_ERROR:
      return NETWORK_SENTENCE
    default:
      return 'Không lưu được bộ. Hãy thử lại.'
  }
}

/** Why a sticker did not move to another pack. */
export function moveErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : ''
  switch (code) {
    case 'STICKER_PACK_NOT_FOUND':
      return PACK_GONE_SENTENCE
    case NETWORK_ERROR:
      return NETWORK_SENTENCE
    default:
      return 'Không chuyển được sticker. Hãy thử lại.'
  }
}
