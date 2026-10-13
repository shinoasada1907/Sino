import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

const PLACEHOLDERS = {
  a: 'bg-[radial-gradient(circle_at_32%_30%,var(--text-muted),var(--hover)_70%)]',
  b: 'bg-[conic-gradient(from_210deg,var(--border-strong),var(--surface),var(--text-subtle),var(--border-strong))]',
  c: 'bg-[repeating-linear-gradient(135deg,var(--hover)_0_4px,var(--border-strong)_4px_6px)]',
  d: 'bg-[linear-gradient(160deg,var(--text-subtle),var(--raised)_75%)]',
}

// The canvas `.avatar` with its placeholders `.av-a` … `.av-d`, shown until there is a picture.
function Avatar({ placeholder = 'a', className, ...props }: ComponentProps<'span'> & { placeholder?: keyof typeof PLACEHOLDERS }) {
  return (
    <span
      data-slot="avatar"
      className={cn(
        'relative inline-block size-9 shrink-0 rounded-full shadow-[inset_0_0_0_1px_var(--border)]',
        PLACEHOLDERS[placeholder],
        className,
      )}
      {...props}
    />
  )
}

export { Avatar }
