import { Clock, Link2Off, RefreshCw, TriangleAlert } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { accountStatusView } from '@/features/overview/format'
import { formatCount, type ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import type { AccountItem } from '../accounts.types'
import { blockedNotice, mobileDisconnectNote, stampLabel, storedSince, syncStatusView } from '../format'
import { ChannelListGroup } from './Channels'
import { DisconnectDialog } from './DisconnectDialog'

/**
 * The detail of the canvas `MobileAccountDetail`: who the account is, what blocks it, its channels, its sync and the
 * disconnect button. The visibility switches of the canvas ("Hiển thị") are left out: the data contract has no such flags.
 */
export function MobileAccountDetail({
  account,
  now,
  nameOf,
  className,
}: {
  account: AccountItem
  now: Date
  nameOf: ProviderNameOf
  className?: string
}) {
  const name = nameOf(account.provider)
  const view = accountStatusView(account, now)
  const sync = syncStatusView(account)
  const blocked = account.status === 'AUTH_EXPIRED' ? blockedNotice(account, nameOf) : null

  return (
    <div className={cn('flex flex-col gap-5 px-4 pt-4.5 pb-5', className)}>
      <div className="flex flex-col items-start gap-3 py-1">
        <AccountAvatar provider={account.provider} size="lg" />
        <h2 className="text-[28px] leading-9 font-semibold tracking-[-0.018em] break-all">{account.externalAccountId}</h2>
        {'detail' in view ? <Status tone="err">{view.detail}</Status> : <Status tone={sync.tone}>{sync.label}</Status>}
      </div>

      {blocked && (
        <div className="flex flex-col gap-3.5 rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-surface px-4.5 py-4">
          <div className="flex items-start gap-3">
            <TriangleAlert className="size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold">{blocked.title}</span>
              <span className="text-sm text-muted-foreground">{blocked.detail}</span>
            </div>
          </div>
          <Button asChild variant="primary">
            <Link to={`/accounts?reconnect=${account.id}`}>
              <RefreshCw strokeWidth={1.6} />
              Đăng nhập lại {name}
            </Link>
          </Button>
        </div>
      )}

      <MobileSection title="Kênh">
        <ChannelListGroup account={account} now={now} />
      </MobileSection>

      <MobileSection title="Đồng bộ">
        <div className="flex flex-col overflow-hidden rounded-md border bg-surface">
          <div className="grid min-h-16 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 border-b px-3.5 py-2.5">
            <RefreshCw className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] leading-5 font-medium">Đã lưu</span>
              <Spec>{storedSince(account)}</Spec>
            </div>
            <span className="font-mono text-[13px] leading-[18px] font-medium">{formatCount(account.storedMessages)}</span>
          </div>
          <div className="grid min-h-16 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5">
            <Clock className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
            <span className="text-[15px] leading-5 font-medium">Kết nối lúc</span>
            <Spec>{stampLabel(account.createdAt)}</Spec>
          </div>
        </div>
      </MobileSection>

      <DisconnectDialog
        account={account}
        nameOf={nameOf}
        trigger={
          <Button type="button" variant="danger">
            <Link2Off strokeWidth={1.6} />
            Ngắt kết nối {name}
          </Button>
        }
      />
      <p className="px-1 text-[13px] leading-[18px] text-muted-foreground">{mobileDisconnectNote(account, nameOf)}</p>
    </div>
  )
}

// The canvas groups a list under a small label ("KÊNH"); the label names the group for screen readers.
function MobileSection({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="pl-1 text-xs leading-4 font-semibold text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}
