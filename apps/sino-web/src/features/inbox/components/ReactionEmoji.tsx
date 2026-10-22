import { cn } from '@/shared/lib/utils'

/**
 * An emoji of a reaction in the app's own style (zalo-reactions): one thin line in the colour of the text, like the
 * icons, from the "Sino Emoji" font (index.css), not the system's colour picture. The variation selector that asks for
 * the colour picture (U+FE0F, as in a red heart) is left out, or a browser would pick a colour font for it. Hidden from
 * screen readers unless `label` names it.
 */
export function ReactionEmoji({ emoji, label, className }: { emoji: string; label?: string; className?: string }) {
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      className={cn('font-emoji leading-none font-light [font-variant-emoji:text]', className)}
    >
      {emoji.replace(/️/g, '')}
    </span>
  )
}
