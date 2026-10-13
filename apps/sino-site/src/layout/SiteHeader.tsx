import { List } from 'lucide-react'
import { useRef } from 'react'
import type { Lang, NavKind } from '@/site/pages'
import { useSite } from '@/site/site-context'
import { cn } from '@/shared/lib/utils'
import { buttonVariants } from '@/shared/ui/button'
import { SinoMark } from '@/shared/ui/sino-mark'
import { wrap } from '@/shared/ui/text'
import { CHROME, MESSAGES_SECTIONS, PRODUCTS } from './nav'

const link =
  'rounded-[8px] px-3 py-2 text-sm leading-5 font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out hover:bg-hover hover:text-foreground'

/** The links of each top bar (D-254): the sections of Sino Messages, or the products of the Sino family. */
function navLinksOf(nav: NavKind, lang: Lang) {
  return nav === 'product'
    ? {
        label: 'Các mục của Sino Messages',
        links: MESSAGES_SECTIONS.map((s) => ({ label: s.label as string, href: `/messages#${s.id}` })),
      }
    : { label: CHROME[lang].familyNav, links: PRODUCTS.map((p) => ({ label: p.name as string, href: p.href as string })) }
}

/** Canvas `lp-nav`. The phone menu is a <details>, so it opens without JavaScript too (D-247). */
export function SiteHeader({ nav, lang = 'vi' }: { nav: NavKind; lang?: Lang }) {
  const { appHref } = useSite()
  const menu = useRef<HTMLDetailsElement>(null)
  const words = CHROME[lang]
  const { label, links } = navLinksOf(nav, lang)
  const navLinks = (className: string) =>
    links.map((l) => (
      <a key={l.href} className={cn(link, className)} href={l.href}>
        {l.label}
      </a>
    ))

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/86 backdrop-blur-md">
      <div className={wrap}>
        <div className="flex h-15 items-center gap-3 md:h-18 md:gap-7">
          <a
            className="inline-flex items-center gap-2.5 text-lg leading-6 font-bold tracking-[-0.03em] text-foreground"
            href="/"
          >
            <SinoMark className="size-5" />
            Sino
          </a>
          <nav className="hidden gap-0.5 lg:flex" aria-label={label}>
            {navLinks('')}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {nav === 'product' && (
              <a
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'max-md:hidden')}
                href={appHref('/login')}
              >
                {words.login}
              </a>
            )}
            <a className={buttonVariants({ size: 'sm' })} href={appHref('/')}>
              {words.openApp}
            </a>
            <details ref={menu} className="group lg:hidden">
              <summary
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                  'list-none group-open:bg-hover group-open:text-foreground [&::-webkit-details-marker]:hidden',
                )}
                aria-label={words.openMenu}
              >
                <List strokeWidth={1.6} aria-hidden="true" />
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
                  <a className={cn(link, 'px-2 py-3 text-base')} href={appHref('/login')}>
                    {words.login}
                  </a>
                )}
              </nav>
            </details>
          </div>
        </div>
      </div>
    </header>
  )
}
