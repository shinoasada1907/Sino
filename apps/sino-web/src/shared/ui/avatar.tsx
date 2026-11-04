import { useState, type ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

const PLACEHOLDERS = {
  a: 'bg-muted/80 text-muted-foreground',
  b: 'bg-surface text-foreground/80 border border-border/70',
  c: 'bg-surface border border-border/80 text-muted-foreground',
  d: 'bg-muted text-foreground/70 border border-border/60',
}

/**
 * The canvas `.avatar` with its placeholders `.av-a` … `.av-d`. With a `src` the picture covers the circle and the
 * placeholder stays under it, so there is a circle while the picture loads, when it fails and when the provider has none
 * (zalo-avatars, D-412). The picture is decoration (`alt=""`) and comes straight from the provider, without a referrer (D-408).
 */
function Avatar({
  placeholder = 'a',
  src,
  className,
  children,
  ...props
}: ComponentProps<'span'> & { placeholder?: keyof typeof PLACEHOLDERS; src?: string | null }) {
  // The address that failed, not a flag: a new address (the person changed their picture) is tried again.
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span
      data-slot="avatar"
      className={cn(
        'relative inline-block size-9 shrink-0 rounded-full shadow-[inset_0_0_0_1px_var(--border)]',
        PLACEHOLDERS[placeholder],
        className,
      )}
      {...props}
    >
      {src && src !== failed && (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(src)}
          className="absolute inset-0 size-full rounded-full object-cover"
        />
      )}
      {children}
    </span>
  )
}

export { Avatar }


