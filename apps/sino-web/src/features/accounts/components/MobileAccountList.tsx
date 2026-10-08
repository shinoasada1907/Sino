import { ChevronRight, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { accountStatusView } from '@/features/overview/format'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Button } from '@/shared/ui/button'
import { Progress } from '@/shared/ui/progress'
import { Spec } from '@/shared/ui/spec'
import { Status, StatusDot } from '@/shared/ui/status'
import type { AccountItem } from '../accounts.types'

/** The list of the canvas `MobileAccounts`: one link per account, then the connect button. */
export function MobileAccountList({
  accounts,
  now,
  nameOf,
  onConnect,
  className,
}: {
  accounts: AccountItem[]
  now: Date
  nameOf: ProviderNameOf
  onConnect: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 px-4 pt-4 pb-5', className)}>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa kết nối tài khoản nào.</p>
      ) : (
        <nav aria-label="Tài khoản đã kết nối" className="flex flex-col overflow-hidden rounded-md border bg-surface">
          {accounts.map((account) => (
            <MobileAccountItem key={account.id} account={account} now={now} name={nameOf(account.provider)} />
          ))}
        </nav>
      )}
      <Button type="button" variant="secondary" onClick={onConnect}>
        <Plus strokeWidth={1.6} />
        Kết nối tài khoản
      </Button>
      <p className="px-1 text-[13px] leading-[18px] text-muted-foreground">
        Mỗi tài khoản đồng bộ riêng. Thông tin đăng nhập được mã hóa trước khi lưu.
      </p>
    </div>
  )
}

// The same states as the overview card: "Ổn định", the first-sync percentage, or since when the access expired.
function MobileAccountItem({ account, now, name }: { account: AccountItem; now: Date; name: string }) {
  const view = accountStatusView(account, now)

  return (
    <Link
      to={`/accounts/${account.id}`}
      className="grid min-h-16 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b px-3.5 py-2.5 text-foreground transition-colors duration-(--dur-hover) ease-out outline-none last:border-b-0 hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
    >
      <AccountAvatar provider={account.provider} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold">{name}</span>
        {'detail' in view ? (
          <span className="truncate text-sm text-danger-ink">{view.detail}</span>
        ) : (
          <Spec className="break-words">{account.externalAccountId}</Spec>
        )}
        {'progress' in view && view.progress !== undefined && <Progress value={view.progress} className="mt-1" />}
      </div>
      {'detail' in view ? (
        <span className="flex items-center gap-1.5">
          <StatusDot tone="err" />
          <ChevronRight className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
        </span>
      ) : (
        <Status tone={view.tone}>{view.label}</Status>
      )}
    </Link>
  )
}
