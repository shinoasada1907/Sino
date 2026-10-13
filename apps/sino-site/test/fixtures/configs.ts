import type { SiteConfig } from '../../src/config.ts'

/** Every field filled with made-up values on reserved names (.example), as a production build needs. */
export const FULL_CONFIG: SiteConfig = {
  siteUrl: 'https://sino.example',
  appUrl: 'https://app.sino.example',
  contactEmail: 'lienhe@sino.example',
  owner: 'Nguyễn Văn Thử',
  effectiveDate: '2026-11-01',
  hosting: 'Máy chủ thử ở Singapore',
}

/** Nothing filled yet, like site.config.ts today. */
export const EMPTY_CONFIG: SiteConfig = {
  siteUrl: null,
  appUrl: null,
  contactEmail: null,
  owner: null,
  effectiveDate: null,
  hosting: null,
}
