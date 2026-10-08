import { cn } from '@/shared/lib/utils'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Button } from '@/shared/ui/button'
import { Progress } from '@/shared/ui/progress'
import { Status } from '@/shared/ui/status'
import { accountStatusView, accountsHeader, type ProviderNameOf } from '../format'
import type { OverviewAccount } from '../overview.types'
import { Card, Spec } from './Card'

// Canvas `Dashboard` "Tài khoản": one row per connected account with its state and, when needed, an action.
export function AccountsCard({
  accounts,
  now,
  nameOf,
  className,
}: {
  accounts: OverviewAccount[]
  now: Date
  nameOf: ProviderNameOf
  className?: string
}) {
  return (
    <Card surface="bento" title="Tài khoản" meta={<Spec>{accountsHeader(accounts)}</Spec>} className={cn('gap-4', className)}>
      {accounts.length === 0 && <p className="text-sm text-muted-foreground">Chưa kết nối tài khoản nào.</p>}
      {accounts.map((account) => (
        <AccountRow key={account.id} account={account} now={now} name={nameOf(account.provider)} />
      ))}
    </Card>
  )
}

function AccountRow({ account, now, name }: { account: OverviewAccount; now: Date; name: string }) {
  const view = accountStatusView(account, now)

  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3">
      <AccountAvatar provider={account.provider} />
      {'progress' in view && view.progress !== undefined ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex justify-between gap-2">
            <span className="text-sm font-semibold">{name}</span>
            <Spec className="truncate">{account.externalAccountId}</Spec>
          </div>
          <Progress value={view.progress} />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold">{name}</span>
          {'detail' in view ? (
            <span className="truncate text-sm text-danger-ink">{view.detail}</span>
          ) : (
            <Spec className="truncate">{account.externalAccountId}</Spec>
          )}
        </div>
      )}
      {'action' in view ? (
        <Button type="button" variant="secondary" size="sm">
          {view.action}
        </Button>
      ) : (
        <Status tone={view.tone}>{view.label}</Status>
      )}
    </div>
  )
}
