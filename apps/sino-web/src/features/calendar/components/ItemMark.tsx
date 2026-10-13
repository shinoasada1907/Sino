import { Bell, Calendar, Check, Repeat, SquareCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import type { ItemIcon } from '../format'

const ICONS: Record<Exclude<ItemIcon, 'source'>, LucideIcon> = { done: Check, reminder: Bell, repeat: Repeat, task: SquareCheck, event: Calendar }

/** The mark before an item of the month or the agenda: the provider it came from, or what it is. */
export function ItemMark({ icon, provider, className }: { icon: ItemIcon; provider: string | null; className?: string }) {
  if (icon === 'source' && provider) {
    return <ProviderIcon provider={provider} className={cn('shrink-0', className)} />
  }
  const Icon = ICONS[icon === 'source' ? 'event' : icon]
  return <Icon aria-hidden="true" className={cn('shrink-0', className)} strokeWidth={1.6} />
}
