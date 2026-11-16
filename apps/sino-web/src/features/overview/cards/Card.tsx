import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

// The three card surfaces of the canvas: `.card-spotlight`, `.card-bento`, `.card-quiet`.
// Soft cards of the Sunset canvas: big radius, a soft shadow instead of a border.
const SURFACE = {
  spotlight: 'rounded-lg bg-surface bg-(image:--glow) p-4.5 shadow-card md:p-6 xl:p-7',
  bento: 'rounded-lg bg-surface p-4.5 shadow-card md:p-5 xl:p-6',
  quiet: 'rounded-lg bg-surface p-4.5 shadow-card md:p-5',
}

/** A card of the overview: a labelled region whose heading is the small label at its top. */
export function Card({
  surface,
  title,
  caps: _caps = false,
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
    <section aria-labelledby={titleId} className={cn('relative flex min-w-0 flex-col overflow-hidden', SURFACE[surface], className)}>
      <div className="flex items-center justify-between gap-3">
        <h2
          id={titleId}
          className={cn('text-base leading-5 font-extrabold tracking-[-0.005em] text-foreground')}
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
