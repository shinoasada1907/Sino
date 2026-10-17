// Copied from apps/sino-site/src/layout/SiteHeader.tsx (web-public-pages, D-312), with the links of sino-web (D-311).
import { List } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { SinoMark } from '@/shared/ui/sino-mark'
import { ICON, wrap } from '../ui'
import { CHROME, MESSAGES_SECTIONS, PRODUCTS, type Lang, type NavKind } from './nav'

const link =
  'rounded-[8px] px-3 py-2 text-sm leading-5 font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out hover:bg-hover hover:text-foreground'

/** The links of each top bar: the sections of Sino Messages at `/`, or the products of the Sino family. */
function navLinksOf(nav: NavKind, lang: Lang) {
  return nav === 'product'
    ? {
        label: 'Các mục của Sino Messages',
        links: MESSAGES_SECTIONS.map((s) => ({ label: s.label as string, href: `/#${s.id}` })),
      }
    : { label: CHROME[lang].familyNav, links: PRODUCTS.map((p) => ({ label: p.name as string, href: p.href as string })) }
}

/**
 * Canvas `lp-nav`: the mark, the links, "Đăng nhập" (on Sino Messages) and "Mở Sino Messages". The links go through
 * the router (D-311): "Mở Sino Messages" opens `/overview`, which asks for a sign-in first when needed. The phone menu
 * is a <details> and closes when one of its links is followed.
 */
export function PublicHeader({ nav, lang = 'vi' }: { nav: NavKind; lang?: Lang }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const words = CHROME[lang]
  const { label, links } = navLinksOf(nav, lang)
  const navLinks = (className: string) =>
    links.map((l) => (
      <Link key={l.href} className={cn(link, className)} to={l.href}>
        {l.label}
      </Link>
    ))

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/86 backdrop-blur-md">
      <div className={wrap}>
        <div className="flex h-15 items-center gap-3 md:h-18 md:gap-7">
          <Link className="inline-flex items-center gap-2.5 text-lg leading-6 font-bold tracking-[-0.03em] text-foreground" to="/">
            <SinoMark className="size-5" />
            Sino
          </Link>
          <nav className="hidden gap-0.5 lg:flex" aria-label={label}>
            {navLinks('')}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {nav === 'product' && (
              <Button asChild variant="ghost" size="sm" className="max-md:hidden">
                <Link to="/login">{words.login}</Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link to="/overview">{words.openApp}</Link>
            </Button>
            <details ref={menu} className="group lg:hidden">
              <summary
                className="inline-flex size-9 shrink-0 cursor-pointer list-none items-center justify-center rounded-[8px] text-muted-foreground transition-colors duration-(--dur-hover) ease-out hover:bg-hover hover:text-foreground group-open:bg-hover group-open:text-foreground [&::-webkit-details-marker]:hidden"
                aria-label={words.openMenu}
              >
                <List {...ICON} className="size-4" />
              </summary>
              <nav
                className="absolute inset-x-0 top-full flex flex-col gap-0.5 border-y border-border bg-background px-4 pt-2 pb-4 md:px-16"
                aria-label="Menu"
                onClick={(event) => {
                  // A section link scrolls the page without leaving it; close the menu so the section shows.
                  if ((event.target as Element).closest('a') && menu.current) menu.current.open = false
                }}
              >
                {navLinks('px-2 py-3 text-base')}
                {nav === 'product' && (
                  <Link className={cn(link, 'px-2 py-3 text-base')} to="/login">
                    {words.login}
                  </Link>
                )}
              </nav>
            </details>
          </div>
        </div>
      </div>
    </header>
  )
}
