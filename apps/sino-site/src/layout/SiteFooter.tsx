import { useSite } from '@/site/site-context'
import { cn } from '@/shared/lib/utils'
import { SinoMark } from '@/shared/ui/sino-mark'
import { microLabel, spec } from '@/shared/ui/text'
import { FOOTER_COLUMNS } from './nav'

const column = 'flex flex-col gap-2.5'
const footLink = 'text-sm leading-5 font-medium text-muted-foreground hover:text-foreground'

/** Canvas `lp-foot` + `lp-legal`. */
export function SiteFooter() {
  const { year } = useSite()

  return (
    <footer>
      <div className="mt-18 grid grid-cols-2 gap-8 border-t border-border pt-12 pb-8 md:mt-24 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className={cn(column, 'col-span-2 gap-3.5 md:col-span-1')}>
          <a className="inline-flex items-center gap-2.5 text-lg leading-6 font-bold tracking-[-0.03em]" href="/">
            <SinoMark className="size-5" />
            Sino
          </a>
          <span className="max-w-75 text-sm leading-5 text-muted-foreground">
            Ứng dụng gọn cho việc mỗi ngày.
          </span>
        </div>
        {FOOTER_COLUMNS.map((col) => (
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
      </div>
    </footer>
  )
}
