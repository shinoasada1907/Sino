import { cn } from '@/shared/lib/utils'

/**
 * An emoji of a reaction rendered with the OS/browser colour emoji font. Hidden from screen readers unless `label` names it.
 */
export function ReactionEmoji({ emoji, label, className }: { emoji: string; label?: string; className?: string }) {
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      className={cn('font-emoji leading-none [font-variant-emoji:emoji]', className)}
    >
      {emoji}
    </span>
  )
}
