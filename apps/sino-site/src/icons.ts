import { raw, type Html } from './html.ts'

/** Lucide strokes as the canvas draws them (24×24, stroke follows the text colour through `.ic`). */
const ICONS = {
  menu: '<path d="M3 12h.01"></path><path d="M3 18h.01"></path><path d="M3 6h.01"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M8 6h13"></path>',
  chevronLeft: '<path d="m15 18-6-6 6-6"></path>',
  chevronRight: '<path d="m9 18 6-6-6-6"></path>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>',
  zalo: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
  messenger: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path><path d="m8 13 3-3 2.5 2L16 9.5"></path>',
  telegram: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>',
  checkSquare: '<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="m9 12 2 2 4-4"></path>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path>',
  note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"></path><path d="M15 3v4a2 2 0 0 0 2 2h4"></path>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"></circle><path d="m21 2-9.6 9.6"></path><path d="m15.5 7.5 3 3L22 7l-3-3"></path>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle>',
  check: '<path d="M20 6 9 17l-5-5"></path>',
  repeat: '<path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path>',
  reply: '<path d="M20 18v-2a4 4 0 0 0-4-4H4"></path><path d="m9 17-5-5 5-5"></path>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path>',
  plus: '<path d="M5 12h14"></path><path d="M12 5v14"></path>',
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
