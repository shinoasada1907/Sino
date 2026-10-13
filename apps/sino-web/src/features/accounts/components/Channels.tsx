import { Inbox, Paperclip, Send, Users, type LucideIcon } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Spec } from '@/shared/ui/spec'
import { Switch } from '@/shared/ui/switch'
import type { AccountItem, ChannelKind } from '../accounts.types'
import { channelHint, channelLabel } from '../format'
import { useSetChannel } from '../useAccounts'

type Channel = AccountItem['channels'][number]

const ICONS: Record<ChannelKind, LucideIcon> = { INBOUND: Inbox, SEND: Send, ATTACHMENTS: Paperclip, CONTACTS: Users }

/**
 * The switch of a channel. A channel that needs more scopes cannot be switched; a channel stopped by expired access
 * shows "Tạm dừng" instead (canvas `MobileAccountDetail`) until the account is signed in again.
 */
function ChannelControl({ account, channel, label }: { account: AccountItem; channel: Channel; label: string }) {
  const setChannel = useSetChannel()
  if (account.status === 'AUTH_EXPIRED' && channel.enabled) {
    return <Badge>Tạm dừng</Badge>
  }
  return (
    <Switch
      aria-label={label}
      checked={channel.enabled}
      disabled={!channel.available}
      onCheckedChange={(enabled) => setChannel.mutate({ accountId: account.id, kind: channel.kind, enabled })}
    />
  )
}

/** The rows of "Kênh đã kết nối" on the detail card (canvas `.chan`). */
export function ChannelRows({ account, now }: { account: AccountItem; now: Date }) {
  return (
    <div>
      {account.channels.map((channel) => {
        const Icon = ICONS[channel.kind]
        const label = channelLabel(channel.kind, account.provider)
        return (
          <div key={channel.kind} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3.5 border-t py-3 first:border-t-0 first:pt-0">
            <Icon className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-sm text-muted-foreground">{channelHint(channel, account, now)}</span>
            </div>
            <ChannelControl account={account} channel={channel} label={label} />
          </div>
        )
      })}
    </div>
  )
}

/** The same channels as a mobile list group (canvas `.list-group-item.is-col`). */
export function ChannelListGroup({ account, now }: { account: AccountItem; now: Date }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border bg-surface">
      {account.channels.map((channel) => {
        const Icon = ICONS[channel.kind]
        const label = channelLabel(channel.kind, account.provider)
        return (
          <div key={channel.kind} className="grid min-h-16 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
            <Icon className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] leading-5 font-medium">{label}</span>
              <Spec className="uppercase">{channelHint(channel, account, now)}</Spec>
            </div>
            <ChannelControl account={account} channel={channel} label={label} />
          </div>
        )
      })}
    </div>
  )
}
