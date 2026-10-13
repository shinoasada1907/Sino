import type { ReactNode } from 'react'
import { pageById, type PageMeta } from '@/site/pages'
import { wrap } from '@/shared/ui/text'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

/** Top bar, the page on the dot grid, footer: the frame every public page shares. */
export function PageFrame({ page, children }: { page: PageMeta; children: ReactNode }) {
  const other = page.alternate ? pageById(page.alternate) : undefined
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader nav={page.nav} lang={page.lang} />
      <main className="block overflow-x-clip bg-dots">
        <div className={wrap}>
          {children}
          <SiteFooter lang={page.lang} alternate={other && { lang: other.lang, path: other.path }} />
        </div>
      </main>
    </div>
  )
}
