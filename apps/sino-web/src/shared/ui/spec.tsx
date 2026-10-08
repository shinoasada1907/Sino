import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

/** The small monospace text of the canvas (`.spec`): counts, times, hints. */
function Spec({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('font-mono text-[11px] leading-4 font-medium text-muted-foreground tabular-nums', className)}>
      {children}
    </span>
  )
}

export { Spec }
