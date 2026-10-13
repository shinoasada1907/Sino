import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

/** A card of the detail page (canvas `.card-quiet.sec-card`, or `.danger-card`): a region named by its heading. */
export function SectionCard({
  title,
  meta,
  danger = false,
  className,
  children,
}: {
  title: string
  meta?: ReactNode
  danger?: boolean
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-md border bg-surface p-5',
        danger && 'gap-3.5 border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-xl leading-7 font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  )
}

export function NoData() {
  return <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>
}
