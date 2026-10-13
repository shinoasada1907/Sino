import type { ReactNode } from 'react'
import { SiteContext } from './site-context'
import type { SiteData } from './site-data'

export function SiteProvider({ site, children }: { site: SiteData; children: ReactNode }) {
  return <SiteContext value={site}>{children}</SiteContext>
}
