import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

// The canvas `.badge`: a small grey label such as "Độ nhạy cao" or "Tạm dừng".
function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex h-5.5 items-center gap-1.5 rounded-xs border bg-raised px-2 text-xs leading-4 font-semibold whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
