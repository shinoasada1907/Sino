import type { SiteConfig } from './src/config.ts'

/**
 * Owner details for the public pages (D-242). `pnpm build` refuses to run while any value is null;
 * `pnpm build:preview` shows "[chưa điền: …]" in their place. See README.md.
 */
const config: SiteConfig = {
  siteUrl: null,
  appUrl: null,
  contactEmail: null,
  owner: null,
  effectiveDate: null,
  hosting: null,
}

export default config
