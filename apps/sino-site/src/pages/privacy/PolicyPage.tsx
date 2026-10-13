import type { ReactNode } from 'react'
import { ConfigValue } from '@/site/ConfigValue'
import type { Lang } from '@/site/pages'
import { cn } from '@/shared/lib/utils'
import { eyebrow, heading2, lead, microLabel, spec } from '@/shared/ui/text'

export interface PolicySection {
  id: string
  title: string
  body: ReactNode
}

/** One legal page in one language: what the canvas `doc-head` and `doc` show. */
export interface PolicyDoc {
  label: string
  title: string
  effective: string
  lead: string
  toc: string
  sections: PolicySection[]
}

/** Canvas `.doc-sec p, li`. */
export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[15px] leading-[25px] text-foreground md:text-base md:leading-[27px]', className)}>{children}</p>
}

/** Canvas `.doc-sec ul`. */
export function Ul({ children }: { children: ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[25px] text-foreground md:text-base md:leading-[27px]">
      {children}
    </ul>
  )
}

/** Canvas `.doc-sec .note`. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-[22px] text-muted-foreground">{children}</p>
}

/** A link inside the text of a legal page. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="text-foreground underline underline-offset-3" href={href}>
      {children}
    </a>
  )
}

/** Canvas `.doc-summary`: the few things worth knowing before reading the rest. */
export function Summary({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="flex flex-col gap-2.5 rounded-md border border-border bg-surface p-4.5">
          <span className="text-sm leading-5 font-semibold">{item.title}</span>
          <span className="text-sm leading-5 text-muted-foreground">{item.body}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Canvas `SitePrivacy` (and later `SiteTerms`): the head with the date it takes effect, a table of contents that
 * stays in view beside the text from 768 px, and the sections. The draft warning of the canvas is gone (SI-03).
 */
export function PolicyPage({ doc, lang }: { doc: PolicyDoc; lang: Lang }) {
  return (
    <>
      <header className="flex max-w-220 flex-col items-start gap-4 pt-10 md:pt-18">
        <span className={eyebrow}>{doc.label}</span>
        <h1 className={heading2}>{doc.title}</h1>
        <span className={spec}>
          {doc.effective} <ConfigValue field="effectiveDate" lang={lang} />
        </span>
        <p className={lead}>{doc.lead}</p>
      </header>
      <div className="grid grid-cols-1 gap-7 pt-7 md:grid-cols-[232px_minmax(0,720px)] md:gap-16 md:pt-12">
        <nav
          data-slot="toc"
          aria-label={doc.toc}
          className="flex flex-row flex-wrap gap-1.5 md:sticky md:top-26 md:flex-col md:gap-0.5 md:self-start"
        >
          <span className={cn(microLabel, 'w-full pb-0.5 md:px-2.5 md:pb-2')}>{doc.toc.toUpperCase()}</span>
          {doc.sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-border px-2.5 py-1.5 text-[13px] leading-5 font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out hover:bg-hover hover:text-foreground md:rounded-[8px] md:border-transparent md:py-2 md:text-sm"
            >
              {s.title}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-11">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`h-${s.id}`} className="flex scroll-mt-24 flex-col gap-3">
              <h2
                id={`h-${s.id}`}
                className="text-[19px] leading-[26px] font-semibold tracking-[-0.012em] md:text-[22px] md:leading-[30px]"
              >
                {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
