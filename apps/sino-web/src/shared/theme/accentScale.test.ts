import { describe, expect, it } from 'vitest'
import { accentScale, contrast, isValidHex } from './accentScale'

const SURFACE = { light: '#FFFFFF', dark: '#322C35' }
const INPUTS = ['#FFE4EE', '#101010', '#CF3F6E', '#FFFF00', '#00FF00', '#0000FF', '#FFFFFF', '#000000', '#6A4FD0']

describe('isValidHex', () => {
  it('accepts #RRGGBB only', () => {
    expect(isValidHex('#CF3F6E')).toBe(true)
    expect(isValidHex('#cf3f6e')).toBe(true)
    expect(['hồng', '#FFF', 'CF3F6E', '#CF3F6', '#CF3F6EE', '#GGGGGG', ''].some(isValidHex)).toBe(false)
  })
})

describe('contrast', () => {
  it('is 21 for black on white and 1 for the same colour', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(contrast('#CF3F6E', '#CF3F6E')).toBeCloseTo(1, 5)
  })
})

describe.each(['light', 'dark'] as const)('accentScale in the %s theme', (theme) => {
  it.each(INPUTS)('%s: text on the button and accent text on a card reach 4.5:1', (hex) => {
    const scale = accentScale(hex, theme)
    expect(contrast(scale.onAccent, scale.accent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(scale.accentInk, SURFACE[theme])).toBeGreaterThanOrEqual(4.5)
  })
})

describe('accentScale', () => {
  it('makes a pale colour darker in the light theme', () => {
    const scale = accentScale('#FFE4EE', 'light')
    expect(scale.accent).not.toBe('#FFE4EE')
    expect(contrast('#FFFFFF', scale.accent)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps a colour that already holds', () => {
    expect(accentScale('#CF3F6E', 'light').accent).toBe('#CF3F6E')
  })

  it('makes a dark colour lighter in the dark theme', () => {
    const scale = accentScale('#101010', 'dark')
    expect(scale.accent).not.toBe('#101010')
    expect(contrast(scale.onAccent, scale.accent)).toBeGreaterThanOrEqual(4.5)
  })

  it('gives the soft, line and tint variables as translucent colours of the accent', () => {
    const scale = accentScale('#6A4FD0', 'light')
    for (const value of [scale.accentSoft, scale.accentLine, scale.accentTint]) {
      expect(value).toMatch(/^rgba\(\d+, \d+, \d+, 0?\.\d+\)$/)
    }
  })
})
