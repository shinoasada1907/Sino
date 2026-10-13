import type { ReactNode } from 'react'
import { wrap } from '@/shared/ui/text'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

/** Top bar, the page on the dot grid, footer: the frame every public page shares. */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="block overflow-x-clip bg-dots">
        <div className={wrap}>
          {children}
          <SiteFooter />
        </div>
      </main>
    </div>
  )
}
