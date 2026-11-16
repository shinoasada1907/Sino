import { describe, expect, it } from 'vitest'
import { API_PACKS, PACKED_STICKERS, pack, sticker } from '@/test/fixtures/stickersApi'
import { groupByPack } from './groupByPack'

const shape = (stickers = PACKED_STICKERS, packs = API_PACKS) =>
  groupByPack(stickers, packs).map((part) => [part.pack?.name ?? null, part.stickers.map((item) => item.id)])

describe('groupByPack: the parts of the Sticker screen (SP-06, delta web-sticker-library)', () => {
  it('has a part per pack in the order of the packs, then the stickers in no pack, each newest first as the list', () => {
    const newer = sticker({ id: 'st-newer', packId: 'pk-cats', createdAt: '2026-10-20T10:00:00Z' })

    expect(shape([newer, ...PACKED_STICKERS])).toEqual([
      ['Mèo', ['st-newer', 'st-cat']],
      ['Chó', []],
      [null, ['st-dance']],
    ])
  })

  it('keeps an empty pack, and leaves out an empty "Chưa xếp bộ"', () => {
    expect(shape([PACKED_STICKERS[1]])).toEqual([
      ['Mèo', ['st-cat']],
      ['Chó', []],
    ])
  })

  it('has nothing for a library with no pack and no sticker', () => {
    expect(shape([], [])).toEqual([])
  })

  it('puts a sticker of a pack it does not know in "Chưa xếp bộ", so no sticker is out of sight', () => {
    expect(shape([sticker({ id: 'st-x', packId: 'pk-unknown' })], [pack({ id: 'pk-cats', name: 'Mèo' })])).toEqual([
      ['Mèo', []],
      [null, ['st-x']],
    ])
  })
})
