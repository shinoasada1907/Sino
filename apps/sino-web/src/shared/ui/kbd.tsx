import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

// The canvas `.kbd`: a keyboard key such as "Ctrl K".
function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'rounded-full bg-raised px-2 shadow-[inset_0_0_0_1px_var(--border)] py-0.5 font-mono text-[11px] leading-4 font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }
