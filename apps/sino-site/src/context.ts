import { FIELD_LABELS, type ConfigField, type SiteConfig } from './config.ts'
import { html, type Html } from './html.ts'

/** `production` needs every config field; `preview` shows what is missing and keeps pages out of search (D-242). */
export type BuildMode = 'production' | 'preview'

/** What a page needs from the config while it is being written. */
export interface SiteContext {
  mode: BuildMode
  /** A config value as text, or a visible "[chưa điền: …]" mark in a preview build. */
  value(field: ConfigField): Html
  /** A link into the Sino app. */
  appHref(path: string): string
  /** The full URL of a page of this site, or the bare path while the domain is unknown. */
  canonical(path: string): string
}

export function createContext(config: SiteConfig, mode: BuildMode): SiteContext {
  return {
    mode,
    value: (field) => {
      const value = config[field]?.trim()
      return value ? html`${value}` : html`<span class="ph">[chưa điền: ${FIELD_LABELS[field]}]</span>`
    },
    appHref: (path) => (config.appUrl ? `${config.appUrl}${path}` : `#chua-dien-app-url`),
    canonical: (path) => `${config.siteUrl ?? ''}${path}`,
  }
}
