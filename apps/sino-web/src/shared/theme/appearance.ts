import { accentScale, isValidHex } from './accentScale'
import type { Theme } from './theme'

/** The palettes, as the API names them (settings-backend, D-490). SAKURA (Anh đào) is the default and has no class. */
export const PALETTES = ['SAKURA', 'SUNSET', 'MINT', 'LAVENDER', 'MONO'] as const
export type Palette = (typeof PALETTES)[number]
export type Corners = 'SOFT' | 'COMPACT'
/** TINTED: the text leans to the palette; NEUTRAL: grey text (D-493). */
export type TextTone = 'TINTED' | 'NEUTRAL'
/** TINTED: the page takes a tint of the palette; WHITE: near-white page with white cards, light theme only (D-494). */
export type LightBackground = 'TINTED' | 'WHITE'

/** How the app looks beyond light and dark: the palette, an own accent colour, the radii and the decorations. */
export interface Appearance {
  palette: Palette
  /** `#RRGGBB` over the accent of the palette, or null. */
  accentColor: string | null
  corners: Corners
  decorations: boolean
  textTone: TextTone
  lightBackground: LightBackground
}

export const DEFAULT_APPEARANCE: Appearance = {
  palette: 'SAKURA',
  accentColor: null,
  corners: 'SOFT',
  decorations: true,
  textTone: 'TINTED',
  lightBackground: 'TINTED',
}

const STORAGE_KEY = 'sino.appearance'
const PALETTE_CLASS: Record<Palette, string | null> = { SAKURA: null, SUNSET: 'pal-sunset', MINT: 'pal-mint', LAVENDER: 'pal-lavender', MONO: 'pal-mono' }
const VARS = ['--accent', '--accent-hover', '--on-accent', '--accent-ink', '--accent-soft', '--accent-line', '--accent-tint'] as const

function isAppearance(value: unknown): value is Appearance {
  const v = value as Appearance
  const tone = (x: unknown, other: string) => x === 'TINTED' || x === other
  return (
    !!v &&
    (PALETTES as readonly string[]).includes(v.palette) &&
    (v.accentColor === null || (typeof v.accentColor === 'string' && isValidHex(v.accentColor))) &&
    (v.corners === 'SOFT' || v.corners === 'COMPACT') &&
    typeof v.decorations === 'boolean' &&
    tone(v.textTone, 'NEUTRAL') &&
    tone(v.lightBackground, 'WHITE')
  )
}

/** The look remembered in this browser, so the page opens in it before the server answers; null on a first visit. */
export function readSavedAppearance(): Appearance | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    // A look saved before the two newer choices existed has no such fields: they take their defaults.
    const parsed = raw && typeof raw === 'object' ? { ...DEFAULT_APPEARANCE, ...raw } : null
    return isAppearance(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveAppearance(appearance: Appearance) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance))
  } catch {
    // Storage is blocked: the look lasts until the page reloads.
  }
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return a.palette === b.palette && a.accentColor === b.accentColor && a.corners === b.corners && a.decorations === b.decorations && a.textTone === b.textTone && a.lightBackground === b.lightBackground
}

/** Puts the palette, corners and decoration classes on <html>, and the own accent colour as inline variables (D-491). */
export function applyAppearance(appearance: Appearance, theme: Theme) {
  const root = document.documentElement
  for (const name of Object.values(PALETTE_CLASS)) {
    if (name) root.classList.remove(name)
  }
  const palette = PALETTE_CLASS[appearance.palette]
  if (palette) root.classList.add(palette)
  root.classList.toggle('corners-compact', appearance.corners === 'COMPACT')
  root.classList.toggle('no-decor', !appearance.decorations)
  root.classList.toggle('text-neutral', appearance.textTone === 'NEUTRAL')
  // Only the light theme has a white background; the class is "bg-white" in the canvas, renamed against Tailwind's utility.
  root.classList.toggle('light-white', appearance.lightBackground === 'WHITE')

  if (appearance.accentColor && isValidHex(appearance.accentColor)) {
    const s = accentScale(appearance.accentColor, theme)
    const values = [s.accent, s.accentHover, s.onAccent, s.accentInk, s.accentSoft, s.accentLine, s.accentTint]
    VARS.forEach((name, i) => root.style.setProperty(name, values[i]))
  } else {
    VARS.forEach((name) => root.style.removeProperty(name))
  }
}
