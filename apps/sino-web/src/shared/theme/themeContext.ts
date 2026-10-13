import { createContext, useContext } from 'react'
import type { Theme } from './theme'

export type ThemeContextValue = {
  theme: Theme
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
