import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { wrap } from '../ui'
import type { Lang, NavKind } from './nav'
import { PublicFooter } from './PublicFooter'
import { PublicHeader } from './PublicHeader'

/**
 * Top bar, the page on the dot grid, footer: the frame every public page shares (sino-site `PageFrame`). It names the
 * browser tab while it is shown (D-315), and does what a static site gets from the browser: a new page starts at the
 * top, and an address with `#…` scrolls to that part (React Router does neither).
 */
export function PublicFrame({
  title,
  lang = 'vi',
  nav,
  alternate,
  children,
}: {
  title: string
  lang?: Lang
  nav: NavKind
  alternate?: { lang: Lang; path: string }
  children?: ReactNode
}) {
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    const before = document.title
    document.title = title
    return () => {
      document.title = before
    }
  }, [title])

  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.()
    } else {
      document.documentElement.scrollTo?.({ top: 0, behavior: 'instant' })
    }
  }, [pathname, hash, key])

  return (
    <div data-public-page lang={lang} className="min-h-svh bg-background">
      <PublicHeader nav={nav} lang={lang} />
      <main className="block overflow-x-clip bg-dots">
        <div className={wrap}>
          {children}
          <PublicFooter lang={lang} alternate={alternate} />
        </div>
      </main>
    </div>
  )
}
