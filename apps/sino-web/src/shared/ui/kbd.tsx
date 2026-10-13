import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

// The canvas `.kbd`: a keyboard key such as "Ctrl K".
function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'rounded-xs border border-b-2 bg-raised px-1.5 py-0.5 font-mono text-[11px] leading-4 font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }
