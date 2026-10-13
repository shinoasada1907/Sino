import type { SiteConfig } from './config.ts'

/** `production` needs every config field; `preview` shows what is missing and keeps pages out of search (D-242). */
export type BuildMode = 'production' | 'preview'

/**
 * What every page renders from. A build bakes the same value into the server and the browser bundle
 * (`__SITE_DATA__`, D-250), so hydration finds the HTML it would have written itself.
 */
export interface SiteData {
  mode: BuildMode
  config: SiteConfig
  /** The copyright year, fixed at build time so both bundles agree on it. */
  year: number
}
