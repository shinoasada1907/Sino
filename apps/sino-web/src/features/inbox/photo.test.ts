import { describe, expect, it } from 'vitest'
import { photoOf } from './photo'

const FULL = 'https://f21-zpc.zdn.vn/jpg/1234/full.jpg'
const THUMB = 'https://b-f21-zpc.zdn.vn/jpg/1234/thumb.jpg'

describe('photoOf (the picture of a photo the page may show)', () => {
  it('keeps the picture, its thumbnail and its caption', () => {
    expect(photoOf({ url: FULL, thumbUrl: THUMB, caption: 'Chuyến đi' })).toEqual({ url: FULL, thumbUrl: THUMB, caption: 'Chuyến đi' })
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
  ])('gives none for %s', (_name, image) => {
    expect(photoOf(image)).toBeNull()
  })

  it.each([
    ['a plain http address', 'http://f21-zpc.zdn.vn/a.jpg'],
    ['a script', 'javascript:alert(1)'],
    ['inline data', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['a relative address', '/a.jpg'],
    ['an address with user info', 'https://user:pw@f21-zpc.zdn.vn/a.jpg'],
    ['an empty text', ''],
  ])('refuses %s as the picture, even when the API gave it', (_name, url) => {
    expect(photoOf({ url, thumbUrl: null, caption: 'Chữ' })).toBeNull()
  })

  it('lets a safe thumbnail stand in for a picture the page refuses', () => {
    expect(photoOf({ url: 'http://f21-zpc.zdn.vn/a.jpg', thumbUrl: THUMB, caption: null })).toEqual({ url: THUMB, thumbUrl: null, caption: null })
  })

  it('drops a thumbnail the page refuses and keeps the picture', () => {
    expect(photoOf({ url: FULL, thumbUrl: 'javascript:alert(1)', caption: null })).toEqual({ url: FULL, thumbUrl: null, caption: null })
  })

  it('drops a thumbnail that is the picture itself', () => {
    expect(photoOf({ url: FULL, thumbUrl: FULL, caption: null })?.thumbUrl).toBeNull()
  })

  it.each([
    ['null', null],
    ['an empty text', ''],
    ['only blanks', '  \n '],
  ])('has no caption for %s', (_name, caption) => {
    expect(photoOf({ url: FULL, thumbUrl: null, caption })?.caption).toBeNull()
  })
})
