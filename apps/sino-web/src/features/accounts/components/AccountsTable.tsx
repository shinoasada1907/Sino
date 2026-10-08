import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import type { AccountItem } from '../accounts.types'
import { enabledChannelCount, healthView, lastSyncLabel, syncStatusView, type ToneLabel } from '../format'

// Canvas `.tbl-acc2`: seven columns, the last one for the button that opens the detail.
const COLUMNS =
  'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,1.6fr)_36px] items-center gap-x-4 px-4'

/**
 * The account table of the canvas `Accounts`, built as an ARIA table so screen readers can move by row and column.
 * Narrower than its minimum width (tablet portrait), it scrolls sideways instead of squeezing the columns.
 */
export function AccountsTable({
  accounts,
  emptyText,
  now,
  nameOf,
}: {
  accounts: AccountItem[]
  emptyText: string
  now: Date
  nameOf: ProviderNameOf
}) {
  return (
    // `relative` keeps absolutely positioned children (the sr-only header) inside the scroll box.
    <div className="relative overflow-x-auto rounded-md border bg-surface">
      <div role="table" aria-label="Tài khoản đã kết nối" className="min-w-224">
        <div role="rowgroup">
          <div role="row" className={cn(COLUMNS, 'h-10 border-b font-mono text-[11px] leading-4 font-medium text-muted-foreground uppercase')}>
            <span role="columnheader">Danh tính</span>
            <span role="columnheader">Nhà cung cấp</span>
            <span role="columnheader">Đồng bộ</span>
            <span role="columnheader">Lần cuối</span>
            <span role="columnheader">Dịch vụ</span>
            <span role="columnheader">Sức khỏe</span>
            <span role="columnheader">
              <span className="sr-only">Chi tiết</span>
            </span>
          </div>
        </div>
        <div role="rowgroup">
          {accounts.length === 0 ? (
            <div role="row" className="px-4 py-6">
              <span role="cell" className="text-sm text-muted-foreground">
                {emptyText}
              </span>
            </div>
          ) : (
            accounts.map((account) => <AccountRow key={account.id} account={account} now={now} name={nameOf(account.provider)} />)
          )}
        </div>
      </div>
    </div>
  )
}

function AccountRow({ account, now, name }: { account: AccountItem; now: Date; name: string }) {
  const sync = syncStatusView(account)

  return (
    <div
      role="row"
      className={cn(COLUMNS, 'relative min-h-16 border-b py-3 transition-colors duration-(--dur-hover) ease-out last:border-b-0 hover:bg-hover')}
    >
      <div role="cell" className="flex min-w-0 items-center gap-3">
        <AccountAvatar provider={account.provider} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold">{account.displayName}</span>
          <Spec className="truncate">{account.externalAccountId}</Spec>
        </div>
      </div>
      <span role="cell" className="text-sm">
        {name}
      </span>
      <span role="cell">
        <Status tone={sync.tone} className="whitespace-normal">
          {sync.label}
        </Status>
      </span>
      <span role="cell">
        <Spec>{lastSyncLabel(account.lastSyncedAt, now)}</Spec>
      </span>
      <span role="cell" className="font-mono text-xs leading-4 font-medium tabular-nums">
        {enabledChannelCount(account)}
      </span>
      <span role="cell">
        <Health view={healthView(account, now)} />
      </span>
      <span role="cell">
        {/* The link covers the whole row (after:inset-0), so a click anywhere on the row opens the detail. */}
        <Button asChild variant="ghost" size="icon-sm">
          <Link
            to={`/accounts/${account.id}`}
            aria-label={`Mở chi tiết tài khoản ${name} ${account.externalAccountId}`}
            className="after:absolute after:inset-0"
          >
            <ChevronRight strokeWidth={1.6} />
          </Link>
        </Button>
      </span>
    </div>
  )
}

/** A problem is a status with a dot; a warning is coloured text; anything else stays quiet. */
function Health({ view }: { view: ToneLabel }) {
  if (view.tone === 'err') {
    return <Status tone="err">{view.label}</Status>
  }
  return <span className={cn('text-sm', view.tone === 'warn' ? 'text-warning-ink' : 'text-muted-foreground')}>{view.label}</span>
}
