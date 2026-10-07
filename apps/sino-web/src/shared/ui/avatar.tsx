import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

// The canvas `.avatar.av-a`: a neutral placeholder until the owner has a picture.
function Avatar({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="avatar"
      className={cn(
        'relative inline-block size-9 shrink-0 rounded-full bg-[radial-gradient(circle_at_32%_30%,var(--text-muted),var(--hover)_70%)] shadow-[inset_0_0_0_1px_var(--border)]',
        className,
      )}
      {...props}
    />
  )
}

export { Avatar }
