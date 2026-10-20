import { describe, expect, it } from 'vitest'
import { ApiError, NETWORK_ERROR } from '@/shared/api/problem'
import { batchRefusal, checkStickerFile, isPackName, isRetryableUpload, moveErrorMessage, packErrorMessage, STICKER_MAX_BYTES, uploadErrorMessage } from './format'

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

const refused = (status: number, code: string, extra: Record<string, unknown> = {}) => new ApiError(status, code, 'detail of the server', [], extra)

describe('uploadErrorMessage: each refusal of the server in Vietnamese, with what to do (ST-14, spec web-sticker-library)', () => {
  it.each([
    [refused(415, 'STICKER_TYPE_UNSUPPORTED'), /chỉ nhận PNG, GIF, WebP/i],
    [refused(413, 'STICKER_TOO_LARGE', { maxBytes: 1_048_576 }), /nặng hơn 1 MB.*nhẹ hơn/],
    [refused(413, 'PAYLOAD_TOO_LARGE'), /nặng hơn 1 MB.*nhẹ hơn/],
    [refused(422, 'STICKER_INVALID_IMAGE', { maxSide: 1024 }), /không đọc được.*1024 điểm ảnh/i],
    [refused(409, 'STICKER_DUPLICATE', { stickerId: 'st-1' }), /đã có trong thư viện/],
    [refused(409, 'STICKER_LIMIT_REACHED', { maxPerOwner: 300 }), /thư viện đã đầy.*300 sticker.*xóa bớt/i],
    [refused(422, 'STICKER_FILE_MISSING'), /trống.*chọn lại/i],
    [new ApiError(0, NETWORK_ERROR, null), /không kết nối được.*thử lại/i],
  ])('says %#: it names the cause and the way out', (error, expected) => {
    expect(uploadErrorMessage(error)).toMatch(expected)
  })

  it.each(['STICKER_TYPE_UNSUPPORTED', 'STICKER_TOO_LARGE', 'PAYLOAD_TOO_LARGE', 'STICKER_INVALID_IMAGE', 'STICKER_DUPLICATE', 'STICKER_LIMIT_REACHED', 'STICKER_FILE_MISSING', NETWORK_ERROR])(
    'shows neither the code %s nor the words of the server',
    (code) => {
      const message = uploadErrorMessage(refused(409, code))

      expect(message).not.toContain(code)
      expect(message).not.toContain('detail of the server')
      expect(message).not.toMatch(/STICKER_|NETWORK_|HTTP_/)
    },
  )

  it('says the limit the server says, not ours: the server is the one that decides and its limit is a setting', () => {
    expect(uploadErrorMessage(refused(413, 'STICKER_TOO_LARGE', { maxBytes: 2_097_152 }))).toContain('nặng hơn 2 MB')
    expect(uploadErrorMessage(refused(413, 'STICKER_TOO_LARGE', { maxBytes: 524_288 }))).toContain('nặng hơn 512 KB')
    expect(uploadErrorMessage(refused(413, 'STICKER_TOO_LARGE', { maxBytes: 1_572_864 }))).toContain('nặng hơn 1,5 MB')
    expect(uploadErrorMessage(refused(409, 'STICKER_LIMIT_REACHED', { maxPerOwner: 50 }))).toContain('50 sticker')
    expect(uploadErrorMessage(refused(422, 'STICKER_INVALID_IMAGE', { maxSide: 512 }))).toContain('512 điểm ảnh')
  })

  it('ignores a limit that is not a number or not positive, and falls back on ours', () => {
    expect(uploadErrorMessage(refused(413, 'STICKER_TOO_LARGE', { maxBytes: 'lớn' }))).toContain('nặng hơn 1 MB')
    expect(uploadErrorMessage(refused(413, 'STICKER_TOO_LARGE', { maxBytes: 0 }))).toContain('nặng hơn 1 MB')
    expect(uploadErrorMessage(refused(413, 'STICKER_TOO_LARGE', { maxBytes: -5 }))).toContain('nặng hơn 1 MB')
    expect(uploadErrorMessage(refused(409, 'STICKER_LIMIT_REACHED', { maxPerOwner: null }))).toContain('300 sticker')
    expect(uploadErrorMessage(refused(409, 'STICKER_LIMIT_REACHED', { maxPerOwner: 0 }))).toContain('300 sticker')
    expect(uploadErrorMessage(refused(422, 'STICKER_INVALID_IMAGE', { maxSide: 0 }))).toContain('1024 điểm ảnh')
    expect(uploadErrorMessage(refused(422, 'STICKER_INVALID_IMAGE'))).toContain('1024 điểm ảnh')
  })

  it('does not take a number written as text for a limit: only a real number is the limit of the server', () => {
    expect(uploadErrorMessage(refused(413, 'STICKER_TOO_LARGE', { maxBytes: '2097152' }))).toContain('nặng hơn 1 MB')
    expect(uploadErrorMessage(refused(409, 'STICKER_LIMIT_REACHED', { maxPerOwner: '50' }))).toContain('300 sticker')
    expect(uploadErrorMessage(refused(422, 'STICKER_INVALID_IMAGE', { maxSide: '512' }))).toContain('1024 điểm ảnh')
  })

  it('has a plain sentence for a code it does not know, a status without a body, and what is not an ApiError', () => {
    // Only an `ApiError` is believed about its code: another object that carries a `code` says nothing about the sticker API.
    const notFromTheApi = [{ code: 'STICKER_DUPLICATE' }, Object.assign(new Error('x'), { code: 'STICKER_LIMIT_REACHED' })]
    for (const error of [refused(500, 'INTERNAL'), new ApiError(502, 'HTTP_502', null), new Error('boom'), 'oops', undefined, ...notFromTheApi]) {
      expect(uploadErrorMessage(error)).toBe('Không tải lên được. Hãy thử lại.')
    }
  })
})

describe('isRetryableUpload: only what may work the second time (ST-14)', () => {
  it('lets a lost network and a server that failed be tried again', () => {
    expect(isRetryableUpload(new ApiError(0, NETWORK_ERROR, null))).toBe(true)
    expect(isRetryableUpload(refused(500, 'INTERNAL'))).toBe(true)
    expect(isRetryableUpload(new Error('boom'))).toBe(true)
  })

  it.each(['STICKER_TYPE_UNSUPPORTED', 'STICKER_TOO_LARGE', 'PAYLOAD_TOO_LARGE', 'STICKER_INVALID_IMAGE', 'STICKER_DUPLICATE', 'STICKER_LIMIT_REACHED', 'STICKER_FILE_MISSING'])(
    'does not offer a second try for %s: the same file would be refused again',
    (code) => {
      expect(isRetryableUpload(refused(409, code))).toBe(false)
    },
  )
})

const refusal = (code: string, extra: Record<string, unknown> = {}) => new ApiError(409, code, 'detail of the server', [], extra)

describe('isPackName: the rule of the server for the name of a pack, checked before sending (SP-06)', () => {
  it.each([
    ['Mèo', true],
    ['  Mèo  ', true],
    ['x'.repeat(50), true],
    ['😀'.repeat(50), true],
    ['', false],
    ['   ', false],
    ['\u3000', false],
    ['x'.repeat(51), false],
    ['😀'.repeat(50) + 'x', false],
  ])('%j is a name: %s', (name, allowed) => {
    expect(isPackName(name)).toBe(allowed)
  })
})

describe('packErrorMessage: each refusal of a pack in Vietnamese (SP-06)', () => {
  it('names the name that is taken, as the owner typed it without the spaces around it', () => {
    expect(packErrorMessage(refusal('STICKER_PACK_NAME_TAKEN'), '  mèo ')).toBe('Đã có bộ tên “mèo”. Hãy đặt tên khác.')
  })

  it('says how many packs one may have: the number the server gives, else 50', () => {
    expect(packErrorMessage(refusal('STICKER_PACK_LIMIT_REACHED', { maxPacks: 20 }), 'Gà')).toBe('Bạn đã có đủ 20 bộ. Hãy xóa bớt một bộ rồi tạo lại.')
    expect(packErrorMessage(refusal('STICKER_PACK_LIMIT_REACHED'), 'Gà')).toBe('Bạn đã có đủ 50 bộ. Hãy xóa bớt một bộ rồi tạo lại.')
    expect(packErrorMessage(refusal('STICKER_PACK_LIMIT_REACHED', { maxPacks: 'many' }), 'Gà')).toBe('Bạn đã có đủ 50 bộ. Hãy xóa bớt một bộ rồi tạo lại.')
  })

  it('says a pack is gone, a name the server refused, a lost network, and anything else', () => {
    expect(packErrorMessage(refusal('STICKER_PACK_NOT_FOUND'), 'Gà')).toBe('Bộ này không còn nữa. Có thể nó vừa bị xóa ở nơi khác.')
    expect(packErrorMessage(refusal('VALIDATION_FAILED'), 'Gà')).toBe('Tên bộ có từ 1 đến 50 ký tự.')
    expect(packErrorMessage(new ApiError(0, NETWORK_ERROR, null), 'Gà')).toBe(
      'Không kết nối được với máy chủ. Hãy kiểm tra mạng rồi thử lại.',
    )
    expect(packErrorMessage(refusal('INTERNAL'), 'Gà')).toBe('Không lưu được bộ. Hãy thử lại.')
    expect(packErrorMessage(new Error('boom'), 'Gà')).toBe('Không lưu được bộ. Hãy thử lại.')
  })
})

describe('moveErrorMessage: why a sticker did not move, in Vietnamese (SP-06)', () => {
  it('says the pack is gone, the network is lost, or to try again', () => {
    expect(moveErrorMessage(refusal('STICKER_PACK_NOT_FOUND'))).toBe('Bộ này không còn nữa. Có thể nó vừa bị xóa ở nơi khác.')
    expect(moveErrorMessage(new ApiError(0, NETWORK_ERROR, null))).toBe('Không kết nối được với máy chủ. Hãy kiểm tra mạng rồi thử lại.')
    expect(moveErrorMessage(refusal('INTERNAL'))).toBe('Không chuyển được sticker. Hãy thử lại.')
  })
})

describe('batchRefusal: what cannot go into the "Thêm sticker" step, said at once (SP-08, spec sticker-upload-editor)', () => {
  const still = { mediaType: 'image/png', editing: 'crop' } as const
  const moving = { mediaType: 'image/gif', editing: 'whole' } as const

  it('lets in a still picture of any weight, since it is made smaller when saved', () => {
    expect(batchRefusal({ size: 1000 }, still)).toBeNull()
    expect(batchRefusal({ size: 20 * STICKER_MAX_BYTES }, { mediaType: 'image/jpeg', editing: 'crop' })).toBeNull()
  })

  it('lets in a moving picture of up to 1 MB, and refuses a heavier one, which is sent as it is', () => {
    expect(batchRefusal({ size: STICKER_MAX_BYTES }, moving)).toBeNull()
    expect(batchRefusal({ size: STICKER_MAX_BYTES + 1 }, moving)).toBe('Ảnh động nặng hơn 1 MB. Ảnh động được lưu nguyên, nên hãy chọn tệp nhẹ hơn.')
  })

  it('refuses what is no picture it can use, and an empty file', () => {
    expect(batchRefusal({ size: 1000 }, null)).toBe('Không phải ảnh dùng được: chỉ nhận PNG, JPEG, GIF, WebP.')
    expect(batchRefusal({ size: 0 }, null)).toBe('Tệp này trống.')
    expect(batchRefusal({ size: 0 }, still)).toBe('Tệp này trống.')
  })
})
