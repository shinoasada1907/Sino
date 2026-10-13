import { FIELD_LABELS, type ConfigField } from './config'
import { formatDate } from './format'
import type { Lang } from './pages'
import { useSite } from './site-context'

/**
 * A value of site.config.ts in a page (D-242): an email becomes a mailto link, a date is written the way the page's
 * language writes it. While a value is missing a preview build shows "[chưa điền: …]", the canvas `.ph` mark; a
 * production build never gets here, it stops first.
 */
export function ConfigValue({ field, lang = 'vi' }: { field: ConfigField; lang?: Lang }) {
  const value = useSite().config[field]?.trim()
  if (!value) {
    return (
      <span className="inline-block rounded-[4px] border border-dashed border-warning px-[5px] font-mono text-[13px] leading-5 font-medium whitespace-nowrap text-warning-ink">
        {`[chưa điền: ${FIELD_LABELS[field]}]`}
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
