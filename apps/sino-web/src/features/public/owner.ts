/**
 * The owner details the privacy policy names (web-public-pages, D-314): the fields of sino-site's `site.config.ts` that
 * the policy shows. `null` is not filled in yet, and the page says "[chưa điền: …]" in its place. Fill them in before the
 * pages go to Google, with the same values as `apps/sino-site/site.config.ts`.
 */
export interface OwnerDetails {
  /** Contact address, also for requests to delete data. */
  contactEmail: string | null
  /** The person or company the privacy policy is in the name of. */
  owner: string | null
  /** When the privacy policy takes effect, YYYY-MM-DD. */
  effectiveDate: string | null
  /** The server provider and where the data is kept, as the privacy policy names them. */
  hosting: string | null
}

export type OwnerField = keyof OwnerDetails

const OWNER: OwnerDetails = {
  contactEmail: null,
  owner: null,
  effectiveDate: null,
  hosting: null,
}

/** The owner details the pages show; a function, so that a test can give its own. */
export function ownerDetails(): OwnerDetails {
  return OWNER
}

/** How each field is named while it is missing (sino-site `FIELD_LABELS`). */
export const OWNER_LABELS: Record<OwnerField, string> = {
  contactEmail: 'email liên hệ',
  owner: 'người đứng tên',
  effectiveDate: 'ngày hiệu lực',
  hosting: 'nhà cung cấp máy chủ',
}
