import { vi } from 'vitest'

let scheme: 'light' | 'dark' = 'light'
// No width by default: every `(min-width: …)` query is false, as on the smallest phone.
let width = 0
let reduceMotion = false

function stub() {
  vi.stubGlobal('matchMedia', (query: string) => {
    const minWidth = /\(min-width:\s*(\d+)px\)/.exec(query)
    return {
      matches: minWidth
        ? width >= Number(minWidth[1])
        : (query === '(prefers-color-scheme: dark)' && scheme === 'dark') ||
          (query === '(prefers-reduced-motion: reduce)' && reduceMotion),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })
}

/** jsdom has no `window.matchMedia`; this stands in for the OS dark-mode setting. */
export function stubOsColorScheme(next: 'light' | 'dark') {
  scheme = next
  width = 0
  reduceMotion = false
  stub()
}

/** The width of the window for `(min-width: …)` queries, for a screen that picks its layout in JavaScript (Lịch). */
export function stubViewport(next: number) {
  width = next
  stub()
}

/** The OS setting "reduce motion", for the motion of the public pages (web-public-pages). */
export function stubReducedMotion(reduce: boolean) {
  reduceMotion = reduce
  stub()
}
