import type { ComponentType } from 'react'
import { PageFrame } from '@/layout/PageFrame'
import { NotFoundPage } from '@/pages/NotFoundPage'
import type { PageId } from '@/site/pages'
import { SiteProvider } from '@/site/SiteProvider'
import type { SiteData } from '@/site/site-data'

const PAGE_COMPONENTS: Record<PageId, ComponentType> = {
  'not-found': NotFoundPage,
}

/** One page of the site in its frame; the server and the browser render exactly this (D-250). */
export function App({ pageId, site }: { pageId: PageId; site: SiteData }) {
  const Page = PAGE_COMPONENTS[pageId]
  return (
    <SiteProvider site={site}>
      <PageFrame>
        <Page />
      </PageFrame>
    </SiteProvider>
  )
}
