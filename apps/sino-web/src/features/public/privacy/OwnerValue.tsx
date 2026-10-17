// Copied from apps/sino-site/src/site/ConfigValue.tsx and format.ts (web-public-pages, D-312), reading owner.ts (D-314).
import type { Lang } from '../layout/nav'
import { OWNER_LABELS, ownerDetails, type OwnerField } from '../owner'

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A YYYY-MM-DD date as each language writes it: 01/11/2026, 1 November 2026. */
export function formatDate(iso: string, lang: Lang): string {
  const [year, month, day] = iso.split('-').map(Number)
  return lang === 'vi'
    ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
    : `${day} ${EN_MONTHS[month - 1]} ${year}`
}

/**
 * An owner detail in the policy: an email becomes a mailto link, a date is written the way the page's language writes
 * it. While a detail is missing the page shows "[chưa điền: …]", the canvas `.ph` mark.
 */
export function OwnerValue({ field, lang = 'vi' }: { field: OwnerField; lang?: Lang }) {
  const value = ownerDetails()[field]?.trim()
  if (!value) {
    return (
      <span className="inline-block rounded-[4px] border border-dashed border-warning px-[5px] font-mono text-[13px] leading-5 font-medium whitespace-nowrap text-warning-ink">
        {`[chưa điền: ${OWNER_LABELS[field]}]`}
      </span>
    )
  }
  if (field === 'contactEmail') {
    return (
      <a className="text-foreground underline underline-offset-3" href={`mailto:${value}`}>
        {value}
      </a>
    )
  }
  return field === 'effectiveDate' ? formatDate(value, lang) : value
}
