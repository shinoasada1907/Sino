import { describe, expect, it } from 'vitest'
import { pictureOf, spriteOf } from './sticker'

describe('pictureOf (the address of a sticker the page may show)', () => {
  it('keeps an https address', () => {
    expect(pictureOf('https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236')).toBe('https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236')
  })

  it('keeps an https address for a gif', () => {
    expect(pictureOf('https://media.tenor.com/xyz/hello.gif')).toBe('https://media.tenor.com/xyz/hello.gif')
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

describe('spriteOf (the sprite sheet of a moving sticker the page may play)', () => {
  const SHEET = 'https://zalo-api.zadn.vn/api/emoticon/sprite?eid=11236&size=130'

  it('keeps a sheet on an https address with its frames and duration', () => {
    expect(spriteOf({ url: SHEET, frames: 7, durationMs: 700 })).toEqual({ url: SHEET, frames: 7, durationMs: 700 })
  })

  it.each([
    ['the fewest frames and the shortest run', 2, 100],
    ['the most frames and the longest run', 300, 10_000],
  ])('keeps %s', (_name, frames, durationMs) => {
    expect(spriteOf({ url: SHEET, frames, durationMs })).toEqual({ url: SHEET, frames, durationMs })
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
  ])('gives none for %s', (_name, sprite) => {
    expect(spriteOf(sprite)).toBeNull()
  })

  it.each([
    ['a plain http address', 'http://zalo-api.zadn.vn/a.png'],
    ['a script', 'javascript:alert(1)'],
    ['inline data', 'data:image/png;base64,AAAA'],
    ['an address with user info', 'https://user:pw@zalo-api.zadn.vn/a.png'],
    ['text that is no address', 'not a url'],
    ['an empty text', ''],
  ])('refuses %s as the address of the sheet', (_name, url) => {
    expect(spriteOf({ url, frames: 7, durationMs: 700 })).toBeNull()
  })

  it.each([
    ['one frame', 1, 700],
    ['no frames', 0, 700],
    ['a negative number of frames', -3, 700],
    ['a part of a frame', 2.5, 700],
    ['too many frames', 301, 700],
    ['a run too short', 7, 99],
    ['no run', 7, 0],
    ['a run too long', 7, 10_001],
    ['frames that are no number', Number.NaN, 700],
    ['a duration that is no number', 7, Number.NaN],
  ])('refuses %s', (_name, frames, durationMs) => {
    expect(spriteOf({ url: SHEET, frames, durationMs })).toBeNull()
  })

  it('refuses a sheet whose numbers came as text, whatever the API was meant to send', () => {
    expect(spriteOf({ url: SHEET, frames: '7' as never, durationMs: '700' as never })).toBeNull()
  })
})
