import { useCallback, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { applyAppearance, DEFAULT_APPEARANCE, readSavedAppearance, saveAppearance, type Appearance } from './appearance'
import { applyTheme, hasSavedPreference, initialPreference, resolveTheme, saveTheme, watchSystemTheme, type ThemePreference } from './theme'
import { ThemeContext } from './themeContext'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference)
  const [chosenHere, setChosenHere] = useState(hasSavedPreference)
  // "Theo hệ thống" follows the OS while the app is open (D-395); a chosen theme does not listen.
  const [appearance, setAppearance] = useState<Appearance>(() => readSavedAppearance() ?? DEFAULT_APPEARANCE)
  const [appearanceChosenHere, setAppearanceChosenHere] = useState(() => readSavedAppearance() !== null)
  const subscribe = useCallback((onChange: () => void) => (preference === 'system' ? watchSystemTheme(onChange) : () => {}), [preference])
  const theme = useSyncExternalStore(
    subscribe,
    () => resolveTheme(preference),
    () => resolveTheme(preference),
  )

  // A layout effect runs before the browser paints, so the first frame already has the right colours.
  useLayoutEffect(() => {
    applyTheme(theme)
    applyAppearance(appearance, theme)
  }, [theme, appearance])

  function chooseAppearance(change: Partial<Appearance>) {
    const next = { ...appearance, ...change }
    saveAppearance(next)
    setAppearance(next)
    setAppearanceChosenHere(true)
  }

  function choose(next: ThemePreference) {
    saveTheme(next)
    setPreference(next)
    setChosenHere(true)
  }

  function toggleTheme() {
    choose(theme === 'dark' ? 'light' : 'dark')
  }

  return <ThemeContext value={{ theme, preference, chosenHere, choose, toggleTheme, appearance, appearanceChosenHere, chooseAppearance }}>{children}</ThemeContext>
}
