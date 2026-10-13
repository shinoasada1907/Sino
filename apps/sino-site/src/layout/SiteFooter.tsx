import type { Lang } from '@/site/pages'
import { useSite } from '@/site/site-context'
import { cn } from '@/shared/lib/utils'
import { SinoMark } from '@/shared/ui/sino-mark'
import { microLabel, spec } from '@/shared/ui/text'
import { CHROME } from './nav'

const column = 'flex flex-col gap-2.5'
const footLink = 'text-sm leading-5 font-medium text-muted-foreground hover:text-foreground'

/**
 * Canvas `lp-foot` + `lp-legal`. A page that exists in the other language links to it in place of the canvas
 * "VI ▾" button (D-243).
 */
export function SiteFooter({ lang = 'vi', alternate }: { lang?: Lang; alternate?: { lang: Lang; path: string } }) {
  const { year } = useSite()
  const words = CHROME[lang]

  return (
    <footer>
      <div className="mt-18 grid grid-cols-2 gap-8 border-t border-border pt-12 pb-8 md:mt-24 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className={cn(column, 'col-span-2 gap-3.5 md:col-span-1')}>
          <a className="inline-flex items-center gap-2.5 text-lg leading-6 font-bold tracking-[-0.03em]" href="/">
            <SinoMark className="size-5" />
            Sino
          </a>
          <span className="max-w-75 text-sm leading-5 text-muted-foreground">{words.tagline}</span>
        </div>
        {words.columns.map((col) => (
          <div key={col.title} className={column}>
            <span className={microLabel}>{col.title}</span>
            {col.links.map((l) => (
              <a key={l.href} className={footLink} href={l.href}>
                {l.label}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border pt-5 pb-10">
        <span className={spec}>{`© ${year} SINO`}</span>
        {alternate && (
          <a
            className="inline-flex h-9 items-center rounded-[8px] border border-border bg-surface px-2.5 font-mono text-xs leading-4 font-semibold tracking-[.04em] text-foreground transition-colors duration-(--dur-hover) ease-out hover:border-border-strong hover:bg-hover"
            href={alternate.path}
            hrefLang={alternate.lang}
            lang={alternate.lang}
          >
            {CHROME[alternate.lang].languageName}
          </a>
        )}
      </div>
    </footer>
  )
}
