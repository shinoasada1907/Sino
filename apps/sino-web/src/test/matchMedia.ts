import { vi } from 'vitest'

/** jsdom has no `window.matchMedia`; this stands in for the OS dark-mode setting. */
export function stubOsColorScheme(scheme: 'light' | 'dark') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' && scheme === 'dark',
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}
