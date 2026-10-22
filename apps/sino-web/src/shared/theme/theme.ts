export type Theme = 'light' | 'dark'

/** What the user chose: a theme, or to follow the OS (fe-ui-settings, D-395). */
export type ThemePreference = Theme | 'system'

const STORAGE_KEY = 'sino.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The theme the user chose earlier, or the OS setting on a first visit. */
export function initialTheme(): Theme {
  return resolveTheme(initialPreference())
}

/** The choice saved earlier; following the OS when nothing (or nothing valid) was saved. */
export function initialPreference(): ThemePreference {
  return readSavedPreference() ?? 'system'
}

/** Whether this browser holds a choice of its own (settings-backend, D-405): then it wins over the one saved on the server. */
export function hasSavedPreference(): boolean {
  return readSavedPreference() !== null
}

/** The theme a choice comes to now: the OS setting for `system`. */
export function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'system' ? systemTheme() : preference
}

/** Remembers the choice. When the browser blocks storage the choice lasts until the page reloads. */
export function saveTheme(preference: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Storage is blocked (private window, site data disabled): keep working, just do not remember.
  }
}

/** Puts `theme-light` or `theme-dark` on <html>; the colour tokens in index.css follow that class. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('theme-light', 'theme-dark')
  root.classList.add(`theme-${theme}`)
}

/** Calls `onChange` when the OS switches between light and dark; returns the function that stops it. */
export function watchSystemTheme(onChange: () => void): () => void {
  const list = window.matchMedia(DARK_QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

function readSavedPreference(): ThemePreference | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}
