export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sino.theme'

/** The theme the user chose earlier, or the OS setting on a first visit. */
export function initialTheme(): Theme {
  return readSavedTheme() ?? systemTheme()
}

/** Remembers the choice. When the browser blocks storage the choice lasts until the page reloads. */
export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
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

function readSavedTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
