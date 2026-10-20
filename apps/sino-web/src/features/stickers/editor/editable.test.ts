import { describe, expect, it } from 'vitest'
import animatedWebp from '../../../../../sino-api/src/test/resources/sticker/animated.webp?inline'
import alphaWebp from '../../../../../sino-api/src/test/resources/sticker/static-alpha.webp?inline'
import losslessWebp from '../../../../../sino-api/src/test/resources/sticker/static-lossless.webp?inline'
import lossyWebp from '../../../../../sino-api/src/test/resources/sticker/static-lossy.webp?inline'
import { inspectPicture } from './editable'

// SP-07, D-346: which pictures get a crop frame and which are kept whole (spec sticker-upload-editor). The kind is read
// from the first bytes of the file, as the server reads it, never from its name or from the type the browser claims.

/**
 * The WebP files the server tests read (`apps/sino-api/src/test/resources/sticker`, made with libwebp), which
 * `vite.config.ts` lets the tests reach; `?inline` hands each over as a `data:` address, decoded here.
 */
const WEBP: Record<string, string> = {
  'static-lossy.webp': lossyWebp,
  'static-lossless.webp': losslessWebp,
  'static-alpha.webp': alphaWebp,
  'animated.webp': animatedWebp,
}
const webp = (name: string) => new File([Uint8Array.from(atob(WEBP[name].split(',')[1]), (char) => char.charCodeAt(0))], name, { type: 'image/webp' })

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((char) => char.charCodeAt(0)) : part)))

/** A PNG chunk: length (big-endian), type, data, and four bytes standing for the CRC (not checked). */
const chunk = (type: string, length = 0) => bytes([length >>> 24, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff], type, new Array(length).fill(0), [0, 0, 0, 0])
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const png = (...chunks: Uint8Array[]) => new Blob([bytes(PNG_SIGNATURE), ...chunks.map((part) => new Uint8Array(part))])

describe('inspectPicture: what the edit step does with a file (SP-07, D-346)', () => {
  it('frames a PNG', async () => {
    expect(await inspectPicture(png(chunk('IHDR', 13), chunk('IDAT', 10), chunk('IEND')))).toEqual({ mediaType: 'image/png', editing: 'crop' })
  })

  it('keeps an animated PNG whole: its acTL chunk comes before the first IDAT, as the server reads it', async () => {
    expect(await inspectPicture(png(chunk('IHDR', 13), chunk('acTL', 8), chunk('IDAT', 10)))).toEqual({ mediaType: 'image/png', editing: 'whole' })
  })

  it('finds the acTL of an animated PNG behind a large chunk, such as a colour profile', async () => {
    expect(await inspectPicture(png(chunk('IHDR', 13), chunk('iCCP', 70_000), chunk('acTL', 8), chunk('IDAT', 10)))).toMatchObject({ editing: 'whole' })
  })

  it('takes a PNG whose chunks end before any IDAT as still', async () => {
    expect(await inspectPicture(png(chunk('IHDR', 13)))).toEqual({ mediaType: 'image/png', editing: 'crop' })
  })

  it('frames a JPEG, which the server does not take and so always goes as an exported PNG', async () => {
    expect(await inspectPicture(new Blob([bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF')]))).toEqual({ mediaType: 'image/jpeg', editing: 'crop' })
  })

  it('keeps every GIF whole, even one of a single frame (D-346)', async () => {
    expect(await inspectPicture(new Blob([bytes('GIF89a', [1, 0, 1, 0])]))).toEqual({ mediaType: 'image/gif', editing: 'whole' })
    expect(await inspectPicture(new Blob([bytes('GIF87a', [1, 0, 1, 0])]))).toEqual({ mediaType: 'image/gif', editing: 'whole' })
  })

  it.each([
    ['static-lossy.webp', 'crop'],
    ['static-lossless.webp', 'crop'],
    ['static-alpha.webp', 'crop'],
    ['animated.webp', 'whole'],
  ])('reads %s, a real WebP, as %s', async (name, editing) => {
    expect(await inspectPicture(webp(name))).toEqual({ mediaType: 'image/webp', editing })
  })

  it('goes by the bytes and not by the name or the type the browser claims', async () => {
    const gifNamedPng = new File([bytes('GIF89a', [1, 0, 1, 0])], 'meo.png', { type: 'image/png' })
    expect(await inspectPicture(gifNamedPng)).toEqual({ mediaType: 'image/gif', editing: 'whole' })
  })

  it.each([
    ['a PDF', bytes('%PDF-1.7')],
    ['an SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['an empty file', bytes()],
    ['a RIFF that is not a WebP', bytes('RIFF', [4, 0, 0, 0], 'WAVE')],
    ['a cut PNG signature', bytes([0x89, 0x50, 0x4e])],
  ])('is no picture for %s', async (_name, content) => {
    expect(await inspectPicture(new Blob([content]))).toBeNull()
  })
})
