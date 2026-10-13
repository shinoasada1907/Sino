import { raw, type Html } from './html.ts'

/** Lucide strokes as the canvas draws them (24×24, stroke follows the text colour through `.ic`). */
const ICONS = {
  menu: '<path d="M3 12h.01"></path><path d="M3 18h.01"></path><path d="M3 6h.01"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M8 6h13"></path>',
  chevronLeft: '<path d="m15 18-6-6 6-6"></path>',
  chevronRight: '<path d="m9 18 6-6-6-6"></path>',
} as const

export type IconName = keyof typeof ICONS

export function icon(name: IconName, extraClass = ''): Html {
  const cls = extraClass ? `ic ${extraClass}` : 'ic'
  return raw(`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`)
}

/** The S2 mark ("S và ô", user 2026-10-02). */
export function logoMark(): Html {
  return raw(
    '<svg class="ic ic-20 logo-mark" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M21 6A9 9 0 0 0 21 24H27A9 9 0 1 1 18 33" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="butt" stroke-linejoin="round"></path>' +
      '<rect x="24" y="1.5" width="9" height="9" rx="2.5" fill="currentColor"></rect></svg>',
  )
}
