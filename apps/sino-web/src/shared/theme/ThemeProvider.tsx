import { useLayoutEffect, useState, type ReactNode } from 'react'
import { applyTheme, initialTheme, saveTheme, type Theme } from './theme'
import { ThemeContext } from './themeContext'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  // A layout effect runs before the browser paints, so the first frame already has the right colours.
  useLayoutEffect(() => applyTheme(theme), [theme])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    saveTheme(next)
    setTheme(next)
  }

  return <ThemeContext value={{ theme, toggleTheme }}>{children}</ThemeContext>
}
