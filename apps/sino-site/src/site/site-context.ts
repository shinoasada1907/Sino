import { createContext, useContext } from 'react'
import type { SiteData } from './site-data.ts'

export const SiteContext = createContext<SiteData | null>(null)

/** What a page needs from the config while it renders. */
export function useSite() {
  const site = useContext(SiteContext)
  if (!site) throw new Error('useSite needs a SiteProvider')
  const { appUrl } = site.config
  return {
    mode: site.mode,
    year: site.year,
    /** A link into the Sino app; a visible placeholder anchor while its URL is not filled in (D-242). */
    appHref: (path: string) => (appUrl ? `${appUrl}${path}` : '#chua-dien-app-url'),
  }
}
