import { useCallback, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { applyTheme, initialPreference, resolveTheme, saveTheme, watchSystemTheme, type ThemePreference } from './theme'
import { ThemeContext } from './themeContext'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference)
  // "Theo hệ thống" follows the OS while the app is open (D-395); a chosen theme does not listen.
  const subscribe = useCallback((onChange: () => void) => (preference === 'system' ? watchSystemTheme(onChange) : () => {}), [preference])
  const theme = useSyncExternalStore(
    subscribe,
    () => resolveTheme(preference),
    () => resolveTheme(preference),
  )

  // A layout effect runs before the browser paints, so the first frame already has the right colours.
  useLayoutEffect(() => applyTheme(theme), [theme])

  function choose(next: ThemePreference) {
    saveTheme(next)
    setPreference(next)
  }

  function toggleTheme() {
    choose(theme === 'dark' ? 'light' : 'dark')
  }

  return <ThemeContext value={{ theme, preference, choose, toggleTheme }}>{children}</ThemeContext>
}
