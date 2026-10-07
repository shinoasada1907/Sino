import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

export type StatusTone = 'ok' | 'warn' | 'err' | 'off'

const DOT: Record<StatusTone, string> = {
  ok: 'bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_20%,transparent)]',
  warn: 'bg-warning shadow-[0_0_0_3px_color-mix(in_srgb,var(--warning)_22%,transparent)]',
  err: 'bg-danger shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_22%,transparent)]',
  off: 'bg-transparent shadow-[inset_0_0_0_1.5px_var(--text-subtle)]',
}

// The canvas `.status` + `.dot` rules: a coloured dot followed by a short text.
function Status({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <span
      data-slot="status"
      className={cn(
        'inline-flex items-center gap-2 text-[13px] leading-[18px] font-medium whitespace-nowrap text-muted-foreground',
        tone === 'err' && 'text-danger-ink',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', DOT[tone])} />
      {children}
    </span>
  )
}

export { Status }
