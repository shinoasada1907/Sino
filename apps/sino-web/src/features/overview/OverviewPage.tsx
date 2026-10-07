import { Plus, RefreshCw } from 'lucide-react'
import { useShellData } from '@/app/shell/useShellData'
import { formatDateLine } from '@/shared/time/local'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
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
  const { overview, receivedAt } = useOverview()
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
      <header className="flex flex-col gap-1.5 py-1 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-x-8 md:py-0">
        <div className="flex min-w-0 flex-col gap-1.5 xl:gap-2.5">
          <span className="font-mono text-xs leading-4 font-medium text-muted-foreground tabular-nums">
            <span className="md:hidden">{formatDateLine(now, undefined, { year: false })}</span>
            <span className="hidden md:inline">{formatDateLine(now)}</span>
          </span>
          <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em] xl:text-[40px] xl:leading-12 xl:font-bold xl:tracking-[-0.028em]">
            {greeting(now)}
            {name ? `, ${name}` : ''}.
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="hidden text-base text-muted-foreground md:inline">{summary.normal}</span>
            {summary.issue && <Status tone="err">{summary.issue}</Status>}
          </div>
        </div>
        <div className="hidden gap-2.5 md:flex">
          <Button type="button" variant="secondary" size="sm">
            <RefreshCw strokeWidth={1.6} />
            Đồng bộ ngay
          </Button>
          <Button type="button" variant="primary" size="sm">
            <Plus strokeWidth={1.6} />
            Kết nối tài khoản
          </Button>
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
