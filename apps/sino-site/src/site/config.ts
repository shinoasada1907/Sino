/** Owner details the site cannot guess. `null` means not filled yet (D-242). */
export interface SiteConfig {
  /** https://<domain>, without a trailing slash. */
  siteUrl: string | null
  /** Where the Sino app runs; "Đăng nhập" opens appUrl + "/login". */
  appUrl: string | null
  /** Contact address, also for requests to delete data. */
  contactEmail: string | null
  /** The person or company the privacy policy and terms are in the name of. */
  owner: string | null
  /** When the privacy policy and terms take effect, YYYY-MM-DD. */
  effectiveDate: string | null
  /** The server provider and where the data is kept, as the privacy policy names them. */
  hosting: string | null
}

export type ConfigField = keyof SiteConfig

export interface ConfigProblem {
  field: ConfigField
  message: string
}

/** How each field is named on a page that still lacks it and in build errors. */
export const FIELD_LABELS: Record<ConfigField, string> = {
  siteUrl: 'tên miền của site',
  appUrl: 'URL của app',
  contactEmail: 'email liên hệ',
  owner: 'người đứng tên',
  effectiveDate: 'ngày hiệu lực',
  hosting: 'nhà cung cấp máy chủ',
}

const FORMATS: Partial<Record<ConfigField, { valid: (value: string) => boolean; rule: string }>> = {
  siteUrl: { valid: isHttpsOrigin, rule: 'phải bắt đầu bằng https:// và không có / ở cuối' },
  appUrl: { valid: isHttpsOrigin, rule: 'phải bắt đầu bằng https:// và không có / ở cuối' },
  contactEmail: { valid: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), rule: 'không phải một địa chỉ email' },
  effectiveDate: { valid: isCalendarDate, rule: 'phải là một ngày có thật, dạng YYYY-MM-DD' },
}

/** Everything that keeps the config from a production build: empty fields, then badly written ones, in field order. */
export function configProblems(config: SiteConfig): ConfigProblem[] {
  return (Object.keys(FIELD_LABELS) as ConfigField[]).flatMap((field) => {
    const value = config[field]?.trim()
    if (!value) {
      return [{ field, message: `${field}: chưa điền (${FIELD_LABELS[field]})` }]
    }
    const format = FORMATS[field]
    return format && !format.valid(value) ? [{ field, message: `${field}: ${format.rule}` }] : []
  })
}

function isHttpsOrigin(value: string): boolean {
  return /^https:\/\/[^\s/]+(\/[^\s]*[^\s/])?$/.test(value)
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
