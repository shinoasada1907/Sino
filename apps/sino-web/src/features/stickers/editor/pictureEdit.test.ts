import { describe, expect, it } from 'vitest'
import { DEFAULT_EDIT, defaultArea, frameAspect, turned, turnedQuarter } from './pictureEdit'

// SP-09: what the owner did to one picture, and the frame it gives when the editor has not measured it yet.

describe('pictureEdit (SP-09)', () => {
  it('starts as the spec says: no turn, no zoom, a square in the middle', () => {
    expect(DEFAULT_EDIT).toEqual({ crop: { x: 0, y: 0 }, zoom: 1, rotation: 0, shape: 'square', area: null })
  })

  it('turns a quarter clockwise each time, and comes back after four', () => {
    expect([0, 90, 180, 270].map((rotation) => turnedQuarter(rotation as 0 | 90 | 180 | 270))).toEqual([90, 180, 270, 0])
  })

  it('swaps the sides of a picture turned a quarter', () => {
    expect(turned(2000, 1000, 0)).toEqual({ width: 2000, height: 1000 })
    expect(turned(2000, 1000, 90)).toEqual({ width: 1000, height: 2000 })
    expect(turned(2000, 1000, 180)).toEqual({ width: 2000, height: 1000 })
    expect(turned(2000, 1000, 270)).toEqual({ width: 1000, height: 2000 })
  })

  it('has a square frame, or the shape of the picture as it shows turned', () => {
    expect(frameAspect({ ...DEFAULT_EDIT, shape: 'square' }, 2000, 1000)).toBe(1)
    expect(frameAspect({ ...DEFAULT_EDIT, shape: 'picture' }, 2000, 1000)).toBe(2)
    expect(frameAspect({ ...DEFAULT_EDIT, shape: 'picture', rotation: 90 }, 2000, 1000)).toBe(0.5)
    // Before the picture is loaded its size is not known: a square.
    expect(frameAspect({ ...DEFAULT_EDIT, shape: 'picture' }, 0, 0)).toBe(1)
  })

  it('frames the largest square in the middle of the turned picture, or the whole of it', () => {
    expect(defaultArea(2000, 1000, DEFAULT_EDIT)).toEqual({ x: 500, y: 0, width: 1000, height: 1000 })
    expect(defaultArea(2000, 1000, { ...DEFAULT_EDIT, rotation: 90 })).toEqual({ x: 0, y: 500, width: 1000, height: 1000 })
    expect(defaultArea(2000, 1000, { ...DEFAULT_EDIT, shape: 'picture' })).toEqual({ x: 0, y: 0, width: 2000, height: 1000 })
    expect(defaultArea(2000, 1000, { ...DEFAULT_EDIT, shape: 'picture', rotation: 270 })).toEqual({ x: 0, y: 0, width: 1000, height: 2000 })
  })

  it('takes the area the editor measured over its own guess', () => {
    const area = { x: 10, y: 20, width: 300, height: 300 }

    expect(defaultArea(2000, 1000, { ...DEFAULT_EDIT, area })).toBe(area)
  })
})
