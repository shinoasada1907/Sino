import { describe, expect, it } from 'vitest'
import { pictureOf } from './sticker'

describe('pictureOf (the address of a sticker the page may show)', () => {
  it('keeps an https address', () => {
    expect(pictureOf('https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236')).toBe('https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236')
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an empty text', ''],
    ['a plain http address', 'http://zalo-api.zadn.vn/a.webp'],
    ['a script', 'javascript:alert(1)'],
    ['inline data', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['a relative address', '/a.webp'],
    ['text that is no address', 'not a url'],
    ['an address with user info', 'https://user:pw@zalo-api.zadn.vn/a.webp'],
  ])('refuses %s, even when the API gave it', (_name, address) => {
    expect(pictureOf(address)).toBeNull()
  })
})
