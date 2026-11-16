import { cn } from '@/shared/lib/utils'
import { Avatar } from './avatar'
import { ProviderIcon } from './provider-icon'

/** Up to two letters of a name or address, in capitals. */
function initialsOf(label: string): string {
  const parts = label.trim().split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return ''
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// The canvas `.avatar` with the provider mark in its corner (`.sub`); `lg` is `.avatar-lg` of the detail pages.
// Until accounts have pictures the canvas draws Messenger with the second placeholder (`.av-b`) everywhere.
function AccountAvatar({ provider, size = 'md', className, label }: { provider: string; size?: 'md' | 'lg'; className?: string; label?: string }) {
  const large = size === 'lg'
  const initials = label ? initialsOf(label) : ''
  return (
    <Avatar placeholder={provider === 'messenger' ? 'b' : 'a'} className={cn(large && 'size-16', className)}>
      {initials && (
        <span aria-hidden="true" className={cn('absolute inset-0 grid place-items-center font-extrabold', large ? 'text-xl' : 'text-xs')}>
          {initials}
        </span>
      )}
      <span
        className={cn(
          'absolute -right-1 -bottom-1 grid place-items-center bg-surface text-foreground shadow-[0_0_0_2px_var(--surface)]',
          large ? 'size-6.5 rounded-[8px]' : 'size-4.5 rounded-[6px]',
        )}
      >
        <ProviderIcon provider={provider} className={large ? 'size-3.5' : 'size-2.75'} />
      </span>
    </Avatar>
  )
}

export { AccountAvatar }
