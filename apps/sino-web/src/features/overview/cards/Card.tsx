import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

// The three card surfaces of the canvas: `.card-spotlight`, `.card-bento`, `.card-quiet`.
const SURFACE = {
  spotlight:
    'rounded-lg border-border-strong bg-raised bg-[radial-gradient(520px_circle_at_18%_0%,var(--spot),transparent_62%)] p-4.5 md:p-6 xl:p-7',
  bento:
    'rounded-lg bg-surface p-4.5 transition-[transform,border-color,background-color] duration-(--dur-hover) ease-out hover:-translate-y-0.5 hover:border-border-strong hover:bg-raised md:p-5 xl:p-6',
  quiet: 'rounded-md bg-surface p-4.5 md:p-5',
}

/** A card of the overview: a labelled region whose heading is the small label at its top. */
export function Card({
  surface,
  title,
  caps = false,
  meta,
  className,
  children,
}: {
  surface: keyof typeof SURFACE
  title: string
  caps?: boolean
  meta?: ReactNode
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={cn('relative flex min-w-0 flex-col overflow-hidden border', SURFACE[surface], className)}>
      <div className="flex items-center justify-between gap-3">
        <h2
          id={titleId}
          className={cn('text-xs leading-4 font-semibold text-muted-foreground', caps && 'tracking-[0.08em] uppercase')}
        >
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  )
}

export { Spec } from '@/shared/ui/spec'

export function NoData() {
  return <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>
}

export function Hairline({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('h-px shrink-0 bg-border', className)} />
}
