import { cn } from '@/shared/lib/utils'
import { Avatar } from './avatar'
import { ProviderIcon } from './provider-icon'

// The canvas `.avatar` with the provider mark in its corner (`.sub`); `lg` is `.avatar-lg` of the detail pages.
// Until accounts have pictures the canvas draws Messenger with the second placeholder (`.av-b`) everywhere.
function AccountAvatar({ provider, size = 'md', className }: { provider: string; size?: 'md' | 'lg'; className?: string }) {
  const large = size === 'lg'
  return (
    <Avatar placeholder={provider === 'messenger' ? 'b' : 'a'} className={cn(large && 'size-16', className)}>
      <span
        className={cn(
          'absolute -right-1 -bottom-1 grid place-items-center border bg-surface text-foreground',
          large ? 'size-6.5 rounded-[8px]' : 'size-4.5 rounded-[6px]',
        )}
      >
        <ProviderIcon provider={provider} className={large ? 'size-3.5' : 'size-2.75'} />
      </span>
    </Avatar>
  )
}

export { AccountAvatar }
