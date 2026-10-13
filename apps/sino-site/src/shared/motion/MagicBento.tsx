// Adapted from React Bits MagicBento (https://reactbits.dev, MIT + Commons Clause), cut to the canvas Motion map (D-252).
import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

/**
 * The bento grid: twelve columns from 768 px, one below. Kept from React Bits: the grid of cards that answer the
 * pointer. Dropped, as the canvas forbids them: particles, spotlight, border glow, tilt, magnetism, click ripple.
 */
export function MagicBento({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-12', className)} {...props} />
}

/** Canvas `card-bento`: on hover it lifts 2 px and its border darkens; with less motion only the border changes. */
export function MagicBentoCard({ className, ...props }: ComponentProps<'article'>) {
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-surface p-6 transition-[translate,border-color,background-color] duration-(--dur-hover) ease-out hover:-translate-y-0.5 hover:border-border-strong hover:bg-raised motion-reduce:hover:translate-y-0',
        className,
      )}
      {...props}
    />
  )
}
