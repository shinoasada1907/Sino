import type { Lang } from './pages.ts'

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * A YYYY-MM-DD date as each language writes it: 01/11/2026, 1 November 2026. Written out by hand rather than with
 * `Intl`, so the server and every browser print exactly the same characters (hydration, D-250).
 */
export function formatDate(iso: string, lang: Lang): string {
  const [year, month, day] = iso.split('-').map(Number)
  return lang === 'vi'
    ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
    : `${day} ${EN_MONTHS[month - 1]} ${year}`
}
