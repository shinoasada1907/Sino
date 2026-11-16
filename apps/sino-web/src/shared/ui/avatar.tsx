import { useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

// The pastel tints of the soft Sunset canvas (`.av.a1` ... `.av.a6`); the keys a-d stay because callers pick them by name.
const PLACEHOLDERS = {
  a: 'bg-[#FAC9D8]',
  b: 'bg-[#FBD5BE]',
  c: 'bg-[#D8CFF7]',
  d: 'bg-[#FBE3A8]',
  e: 'bg-[#BFE7D5]',
  f: 'bg-[#F6C0BC]',
}

/**
 * The canvas `.avatar` with its placeholders `.av-a` … `.av-d`. With a `src` the picture covers the circle and the
 * placeholder stays under it, so there is a circle while the picture loads, when it fails and when the provider has none
 * (zalo-avatars, D-412). `fallback` (a letter, say) shows only when there is no picture or it failed to load, so it does not
 * show through a transparent PNG; `children` always show. The picture is decoration (`alt=""`) and comes straight from the provider, without a referrer (D-408).
 */
function Avatar({
  placeholder = 'a',
  src,
  fallback,
  className,
  children,
  ...props
}: ComponentProps<'span'> & { placeholder?: keyof typeof PLACEHOLDERS; src?: string | null; fallback?: ReactNode }) {
  // The address that failed, not a flag: a new address (the person changed their picture) is tried again.
  const [failed, setFailed] = useState<string | null>(null)
  const showsPicture = Boolean(src) && src !== failed
  return (
    <span
      data-slot="avatar"
      className={cn(
        'relative inline-block size-9 shrink-0 rounded-full font-extrabold text-[#4A2234]',
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
      {!showsPicture && fallback}
      {children}
    </span>
  )
}

export { Avatar }


