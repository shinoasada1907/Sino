// Which pictures the edit step frames and which it keeps whole (SP-07, D-346), told by the first bytes of the file as the
// server tells them (`PngHead`, `GifHead`, `WebpHead` of sino-api), never by its name or the type the browser claims.

export type PictureType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/**
 * What the edit step does with a picture: `crop` has the frame, the zoom and the turn, and is sent as an exported PNG;
 * `whole` is sent as the very file, so that it keeps moving.
 */
export interface PictureKind {
  mediaType: PictureType
  editing: 'crop' | 'whole'
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** The chunks of a PNG walked before giving up on finding its first `IDAT`; real files have a handful. */
const MOST_PNG_CHUNKS = 64
/** The animation flag in the flags byte of a `VP8X` chunk, the first chunk of every animated WebP. */
const WEBP_ANIMATION_FLAG = 0x02

async function bytesOf(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

const text = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length))
const startsWith = (bytes: Uint8Array, expected: number[]) => expected.every((value, at) => bytes[at] === value)

/**
 * The type of a picture the library can take and whether it is framed, or `null` for anything else (a PDF, an SVG, an
 * empty or cut file). A GIF is always kept whole, even one of a single frame: counting its frames only to decide is not
 * worth it (D-346). An animated WebP has the animation flag in its first chunk, `VP8X`; an animated PNG (APNG) has an
 * `acTL` chunk before its first `IDAT`, which is why the chunks of a PNG are walked, a few bytes each, up to that one.
 */
export async function inspectPicture(file: Blob): Promise<PictureKind | null> {
  const head = await bytesOf(file, 0, 21)
  if (startsWith(head, PNG_SIGNATURE)) {
    return { mediaType: 'image/png', editing: (await isAnimatedPng(file)) ? 'whole' : 'crop' }
  }
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return { mediaType: 'image/jpeg', editing: 'crop' }
  }
  if (head.length >= 6 && (text(head, 0, 6) === 'GIF87a' || text(head, 0, 6) === 'GIF89a')) {
    return { mediaType: 'image/gif', editing: 'whole' }
  }
  if (head.length >= 16 && text(head, 0, 4) === 'RIFF' && text(head, 8, 4) === 'WEBP') {
    const animated = text(head, 12, 4) === 'VP8X' && head.length >= 21 && (head[20] & WEBP_ANIMATION_FLAG) !== 0
    return { mediaType: 'image/webp', editing: animated ? 'whole' : 'crop' }
  }
  return null
}

/** Whether an `acTL` chunk comes before the first `IDAT`: each chunk is a length (4 bytes, big-endian), a type, its data and a CRC. */
async function isAnimatedPng(file: Blob): Promise<boolean> {
  let offset = PNG_SIGNATURE.length
  for (let chunks = 0; chunks < MOST_PNG_CHUNKS && offset + 8 <= file.size; chunks++) {
    const header = await bytesOf(file, offset, offset + 8)
    const type = text(header, 4, 4)
    if (type === 'acTL') {
      return true
    }
    if (type === 'IDAT') {
      return false
    }
    const length = ((header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3]) >>> 0
    offset += 12 + length
  }
  return false
}
