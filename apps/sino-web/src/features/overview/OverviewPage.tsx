import { Plus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { useShellData } from '@/app/shell/useShellData'
import { formatDateLine } from '@/shared/time/local'
import { useNow } from '@/shared/time/useNow'
import { Avatar } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { SoonButton } from '@/shared/ui/soon-button'
import { useAccounts } from '@/features/accounts/useAccounts'
import { useMe } from '@/features/auth/useAuth'
import { Status } from '@/shared/ui/status'
import { AccountsCard } from './cards/AccountsCard'
import { ActivityCard } from './cards/ActivityCard'
import { InboxCard } from './cards/InboxCard'
import { RegistrationsCard } from './cards/RegistrationsCard'
import { ShortcutsCard } from './cards/ShortcutsCard'
import { SyncCard } from './cards/SyncCard'
import { TodayCard } from './cards/TodayCard'
import { accountSummary, greeting, providerNameOf } from './format'
import { useOverview } from './useOverview'

/**
 * The Tổng quan screen (canvas `Dashboard`, `TabletDashboard`, `MobileDashboard`). Each size shows the cards of its
 * artboard: 12 columns on desktop, 2 on tablet without "Hôm nay" and "Lối tắt", 1 on mobile with "Hôm nay" first.
 */
export function OverviewPage() {
  const { shell } = useShellData()
  const { overview: base, receivedAt } = useOverview()
  // There is no `/api/overview` yet, so the account card and the greeting read the real list of accounts; the other cards stay empty.
  const { list } = useAccounts()
  const overview = base && (list ? { ...base, accounts: list.accounts, providers: list.providers } : base)
  const { data: me } = useMe()
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))

  if (!overview) {
    return (
      <p role="status" className="p-8 text-sm text-muted-foreground">
        Đang tải…
      </p>
    )
  }

  const nameOf = providerNameOf(overview.providers)
  const summary = accountSummary(overview.accounts, nameOf)
  const name = shell ? (shell.owner.shortName ?? shell.owner.displayName) : null

  return (
    <div className="flex flex-col gap-3 px-4 pt-1 pb-5 md:gap-5 md:p-6 xl:gap-7 xl:p-8">
      <header className="relative flex flex-col gap-1.5 overflow-hidden rounded-lg bg-surface bg-(image:--glow) p-5 shadow-card md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-8 md:p-7 xl:p-8">
        <span aria-hidden="true" className="decor dots pointer-events-none absolute top-5 right-6 hidden h-12 w-18 opacity-80 md:block" />
        <div className="flex min-w-0 flex-col gap-1.5 xl:gap-2.5">
          <Badge tone="accent" className="self-start font-mono tabular-nums">
            <span className="md:hidden">{formatDateLine(now, undefined, { year: false })}</span>
            <span className="hidden md:inline">{formatDateLine(now)}</span>
          </Badge>
          <h1 className="text-[28px] leading-9 text-brand-ink xl:text-[44px] xl:leading-[1.05]">
            {greeting(now)}
            {name ? `, ${name}` : ''}.
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="hidden text-base text-muted-foreground md:inline">{summary.normal}</span>
            {summary.issue && <Status tone="err">{summary.issue}</Status>}
          </div>
        </div>
        <div className="relative hidden flex-col items-end gap-4 md:flex">
          {me && (
            <Avatar src={me.avatarUrl} placeholder="a" className="size-24 text-[28px] shadow-[0_0_0_5px_var(--surface),0_14px_30px_-14px_var(--accent)]">
              {!me.avatarUrl && (
                <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
                  {me.displayName.trim().slice(0, 1).toUpperCase()}
                </span>
              )}
            </Avatar>
          )}
          <div className="flex gap-2.5">
            <SoonButton variant="soft" size="sm">
              <RefreshCw strokeWidth={1.6} />
              Đồng bộ ngay
            </SoonButton>
            <Button asChild variant="primary" size="sm">
              <Link to="/accounts?connect=new">
                <Plus strokeWidth={1.6} />
                Kết nối tài khoản
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-12">
        <InboxCard inbox={overview.inbox} now={now} nameOf={nameOf} className="md:col-span-2 xl:col-span-7 xl:row-span-2" />
        <TodayCard today={overview.today} now={now} className="-order-1 md:order-none md:hidden xl:col-span-5 xl:row-span-2 xl:flex" />
        <AccountsCard accounts={overview.accounts} now={now} nameOf={nameOf} className="xl:col-span-4" />
        <SyncCard activity={overview.syncActivity} now={now} nameOf={nameOf} className="hidden md:flex xl:col-span-4" />
        <RegistrationsCard registrations={overview.registrations} now={now} className="xl:col-span-4" />
        <ActivityCard activity={overview.activity} now={now} nameOf={nameOf} className="hidden md:flex xl:col-span-8" />
        <ShortcutsCard className="hidden xl:col-span-4 xl:flex" />
      </div>
    </div>
  )
}
