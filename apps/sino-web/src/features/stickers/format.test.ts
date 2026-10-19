import { describe, expect, it } from 'vitest'
import { checkStickerFile, STICKER_MAX_BYTES } from './format'

const file = (name: string, type: string, size = 1000) => ({ name, type, size })
const TYPE_REASON = /chỉ nhận PNG, GIF, WebP/i

describe('checkStickerFile: what the web refuses before asking the server (ST-13, spec web-sticker-library)', () => {
  it.each([
    ['meo.png', 'image/png'],
    ['nhay.gif', 'image/gif'],
    ['cuoi.webp', 'image/webp'],
  ])('accepts %s by its type %s', (name, type) => {
    expect(checkStickerFile(file(name, type))).toEqual({ ok: true })
  })

  it.each(['meo.png', 'NHAY.GIF', 'cuoi.WebP', 'ảnh đẹp.png'])('accepts %s by its extension when the browser gives no type', (name) => {
    expect(checkStickerFile(file(name, ''))).toEqual({ ok: true })
  })

  it.each([
    ['anh.jpg', 'image/jpeg'],
    ['anh.jpeg', ''],
    ['logo.svg', 'image/svg+xml'],
    ['ghi-chu.txt', 'text/plain'],
    ['khong-co-duoi', ''],
    ['meo.png.exe', ''],
    ['png', ''],
  ])('refuses %s (type "%s") and says which types are taken', (name, type) => {
    const result = checkStickerFile(file(name, type))

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(TYPE_REASON)
  })

  it('goes by the type when there is one: a JPEG named .png is refused here (the server reads the content to be sure)', () => {
    expect(checkStickerFile(file('gia.png', 'image/jpeg')).ok).toBe(false)
  })

  it('takes a file of exactly the limit and refuses one byte more, naming the limit', () => {
    expect(STICKER_MAX_BYTES).toBe(1_048_576) // DN-1: 1 MiB, the same as `sino.stickers.max-file-size`.
    expect(checkStickerFile(file('vua.png', 'image/png', STICKER_MAX_BYTES))).toEqual({ ok: true })

    const result = checkStickerFile(file('nang.png', 'image/png', STICKER_MAX_BYTES + 1))

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/nặng hơn 1 MB/)
  })

  it('refuses an empty file', () => {
    const result = checkStickerFile(file('trong.png', 'image/png', 0))

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/trống/)
  })

  it('says the type first when a file is wrong in both ways: a smaller JPEG would still be refused', () => {
    const result = checkStickerFile(file('lon.jpg', 'image/jpeg', STICKER_MAX_BYTES * 5))

    expect(!result.ok && result.reason).toMatch(TYPE_REASON)
  })
})
