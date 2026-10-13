import type { SiteData } from './site-data.ts'

declare global {
  /** Replaced at build time by Vite `define` (vite.config.ts, scripts/build.ts). */
  const __SITE_DATA__: SiteData
}
