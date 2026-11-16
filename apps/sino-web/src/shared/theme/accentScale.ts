// A custom accent colour (D-489): from one `#RRGGBB` Sino works out the other accent variables, in OKLCH, so that the text on the
// primary button and the accent text on a card reach 4.5:1 in both themes, however pale or dark the colour the user typed.
import type { Theme } from './theme'

export interface AccentScale {
  accent: string
  accentHover: string
  onAccent: string
  accentInk: string
  accentSoft: string
  accentLine: string
  accentTint: string
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function isValidHex(value: string): boolean {
  return HEX.test(value)
}

type Rgb = [number, number, number]
type Lch = { l: number; c: number; h: number }

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb
}

function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

function rgbToLch(rgb: Rgb): Lch {
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(a, bb), h: Math.atan2(bb, a) }
}

/** OKLCH to sRGB; a colour outside the gamut loses chroma until it fits. */
function lchToRgb({ l, c, h }: Lch): Rgb {
  let chroma = c
  for (let i = 0; i < 40; i++) {
    const a = chroma * Math.cos(h)
    const b = chroma * Math.sin(h)
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
    const lin = [
      4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
      -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
      -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ]
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005) || chroma < 0.0005) {
      return lin.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb
    }
    chroma *= 0.92
  }
  return [0, 0, 0]
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio of two `#RRGGBB` colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Moves the lightness of `hex` (down for `direction` -1, up for 1) until it reaches `ratio` against `against`. */
function untilContrast(hex: string, against: string, ratio: number, direction: 1 | -1): string {
  const start = rgbToLch(hexToRgb(hex))
  let candidate = hex
  for (let step = 0; step <= 100 && contrast(candidate, against) < ratio; step++) {
    const l = Math.min(1, Math.max(0, start.l + direction * 0.01 * step))
    candidate = rgbToHex(lchToRgb({ ...start, l }))
  }
  return candidate
}

const shift = (hex: string, delta: number) => {
  const lch = rgbToLch(hexToRgb(hex))
  return rgbToHex(lchToRgb({ ...lch, l: Math.min(0.98, Math.max(0.05, lch.l + delta)) }))
}

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v * 255))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const SURFACE = { light: '#FFFFFF', dark: '#322C35' }
const ON_ACCENT = { light: '#FFFFFF', dark: '#1A0E14' }

/** The accent variables for the colour the user typed, in `theme`. `hex` must pass `isValidHex`. */
export function accentScale(hex: string, theme: Theme): AccentScale {
  const onAccent = ON_ACCENT[theme]
  const dark = theme === 'dark'
  // Light theme: white text on the button, so the colour darkens until it holds; dark theme: dark text, so it lightens.
  const accent = untilContrast(hex.toUpperCase(), onAccent, 4.5, dark ? 1 : -1)
  const ink = untilContrast(accent, SURFACE[theme], 4.5, dark ? 1 : -1)
  return {
    accent,
    accentHover: shift(accent, dark ? 0.04 : -0.04),
    onAccent,
    accentInk: ink,
    accentSoft: rgba(accent, dark ? 0.15 : 0.13),
    accentLine: rgba(accent, 0.45),
    accentTint: rgba(accent, dark ? 0.35 : 0.4),
  }
}
