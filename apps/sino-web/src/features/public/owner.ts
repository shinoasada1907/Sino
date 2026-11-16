/**
 * The owner details the privacy policy names (web-public-pages D-314, public-pages-prerender PP-01). `null` is not
 * filled in yet: the page says "[chưa điền: …]" in its place, and `pnpm build` fails on it (D-465). Only the server
 * provider is written per language, so that an English page shows no Vietnamese; the rest is the same in both.
 */
export interface OwnerDetails {
  /** Contact address, also for requests to delete data. */
  contactEmail: string | null
  /** The person or company the privacy policy is in the name of. */
  owner: string | null
  /** When the privacy policy takes effect, YYYY-MM-DD. */
  effectiveDate: string | null
  /** The server provider and where the data is kept, as the privacy policy names them, in each language. */
  hosting: { vi: string; en: string } | null
}

export type OwnerField = keyof OwnerDetails

const OWNER: OwnerDetails = {
  contactEmail: 'tienct07@gmail.com',
  owner: 'Cu Tiến (Sino)',
  effectiveDate: '2026-11-04',
  hosting: {
    vi: 'máy chủ riêng do Sino tự vận hành, đặt tại Việt Nam',
    en: 'a private server run by Sino itself, located in Vietnam',
  },
}

/** The owner details the pages show; a function, so that a test can give its own. */
export function ownerDetails(): OwnerDetails {
  return OWNER
}

/** How each field is named while it is missing. */
export const OWNER_LABELS: Record<OwnerField, string> = {
  contactEmail: 'email liên hệ',
  owner: 'người đứng tên',
  effectiveDate: 'ngày hiệu lực',
  hosting: 'nhà cung cấp máy chủ',
}
