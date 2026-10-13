import { useSyncExternalStore } from 'react'

/**
 * Whether a media query matches, following changes: for what CSS cannot switch, such as the text of a placeholder.
 * Layout itself stays in CSS (`md:`, `xl:`).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
