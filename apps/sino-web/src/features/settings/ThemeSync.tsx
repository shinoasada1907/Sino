import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import type { ThemePreference } from '@/shared/theme/theme'
import { sameAppearance, type Appearance } from '@/shared/theme/appearance'
import { useTheme } from '@/shared/theme/themeContext'
import { patchSettings, type UserSettings } from './settings.api'
import { SETTINGS_QUERY_KEY, useSettings } from './useSettings'

const TO_API: Record<ThemePreference, UserSettings['theme']> = { system: 'SYSTEM', light: 'LIGHT', dark: 'DARK' }
const FROM_API: Record<UserSettings['theme'], ThemePreference> = { SYSTEM: 'system', LIGHT: 'light', DARK: 'dark' }

/**
 * Keeps the theme of this browser and the one saved on the server together (settings-backend, D-405), on every
 * signed-in screen. A browser that never chose takes the saved theme, so it follows the user to a new device. One that
 * chose keeps its choice and saves it, also a choice made from the user menu or Thêm; a refused save is not sent again
 * until the next choice.
 *
 * It saves with a plain request, not `useMutation`: the shell would then watch the mutation cache, and when a session
 * ends (`forgetSession` clears that cache) it would render again before the redirect and read every screen's data anew.
 */
function useThemeSync() {
  const { preference, chosenHere, choose } = useTheme()
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const sent = useRef<ThemePreference | null>(null)
  const saved = settings ? FROM_API[settings.theme] : null

  useEffect(() => {
    if (saved === null || saved === preference) {
      return
    }
    if (!chosenHere) {
      choose(saved)
      return
    }
    if (sent.current === preference) {
      return
    }
    sent.current = preference
    const theme = TO_API[preference]
    queryClient.setQueryData<UserSettings>(SETTINGS_QUERY_KEY, (current) => current && { ...current, theme })
    patchSettings({ theme }).then(
      (stored) => queryClient.setQueryData(SETTINGS_QUERY_KEY, stored),
      // The theme stays as chosen in this browser; the server keeps its own until the next choice.
      () => undefined,
    )
  }, [saved, preference, chosenHere, choose, queryClient])
}

/**
 * The same for the palette, own accent colour, corners and decorations (fe-ui-sunset, D-491): a browser that never chose
 * takes the saved look; one that chose keeps it and saves it. A server that does not send the fields (an older one) is left alone.
 */
function useAppearanceSync() {
  const { appearance, appearanceChosenHere, chooseAppearance } = useTheme()
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const sent = useRef<string | null>(null)
  const palette = settings?.palette
  const corners = settings?.corners
  const accentColor = settings?.accentColor ?? null
  const decorations = settings?.decorations !== false
  const textTone = settings?.textTone ?? 'TINTED'
  const lightBackground = settings?.lightBackground ?? 'TINTED'
  // Memoized on the saved fields: a new object every render would re-run the effect below each time.
  const saved = useMemo<Appearance | null>(
    () => (palette && corners ? { palette, accentColor, corners, decorations, textTone, lightBackground } : null),
    [palette, corners, accentColor, decorations, textTone, lightBackground],
  )

  useEffect(() => {
    if (saved === null || sameAppearance(saved, appearance)) {
      return
    }
    if (!appearanceChosenHere) {
      chooseAppearance(saved)
      return
    }
    const key = JSON.stringify(appearance)
    if (sent.current === key) {
      return
    }
    sent.current = key
    queryClient.setQueryData<UserSettings>(SETTINGS_QUERY_KEY, (current) => current && { ...current, ...appearance })
    patchSettings(appearance).then(
      (stored) => queryClient.setQueryData(SETTINGS_QUERY_KEY, stored),
      () => undefined,
    )
  }, [saved, appearance, appearanceChosenHere, chooseAppearance, queryClient])
}

/**
 * `useThemeSync` in a component of its own, which draws nothing: its query and its saves render this component alone,
 * not the shell around it, whose other queries would otherwise be built again when a session ends.
 */
export function ThemeSync() {
  useThemeSync()
  useAppearanceSync()
  return null
}
