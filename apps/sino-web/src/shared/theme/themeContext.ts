import { createContext, useContext } from 'react'
import type { Appearance } from './appearance'
import type { Theme, ThemePreference } from './theme'

export type ThemeContextValue = {
  /** The theme in use now. */
  theme: Theme
  /** What the user chose: a theme, or `system` to follow the OS (fe-ui-settings, D-395). */
  preference: ThemePreference
  /** Whether the preference was chosen in this browser (now or on an earlier visit), not just the default. */
  chosenHere: boolean
  choose: (preference: ThemePreference) => void
  /** The palette, own accent colour, corners and decorations in use (fe-ui-sunset, D-489). */
  appearance: Appearance
  /** Whether the look was chosen in this browser (now or earlier), not just the default. */
  appearanceChosenHere: boolean
  /** Changes some of the look at once and remembers it in this browser. */
  chooseAppearance: (change: Partial<Appearance>) => void
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
