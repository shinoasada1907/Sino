import { createContext, useContext } from 'react'
import type { Theme, ThemePreference } from './theme'

export type ThemeContextValue = {
  /** The theme in use now. */
  theme: Theme
  /** What the user chose: a theme, or `system` to follow the OS (fe-ui-settings, D-395). */
  preference: ThemePreference
  choose: (preference: ThemePreference) => void
  /** Light to dark and back; leaves "follow the OS". */
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

/** The current theme and a way to switch it; only works below <ThemeProvider>. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useTheme must be used inside <ThemeProvider>')
  }
  return value
}
