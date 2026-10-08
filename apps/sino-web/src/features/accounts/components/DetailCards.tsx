import { Check, ChevronRight, Globe, Inbox, Key, Link, Send, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { methodLabel, type ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { formatDate } from '@/shared/time/local'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import type { AccountActivity, AccountExtras, AccountItem } from '../accounts.types'
import { accessNote, accountActivityText, isMail, scopeLabel, stampLabel, syncRunsLabel, syncRunView } from '../format'
import { NoData, SectionCard } from './SectionCard'

// The cards of the canvas `AccountDetail` that show the detail sections; each says "Chưa có dữ liệu" when its part is null.

export function ScopesCard({
  scopes,
  account,
  now,
  className,
}: {
  scopes: AccountExtras['scopes']
  account: AccountItem
  now: Date
  className?: string
}) {
  const note = accessNote(account.access, now)
  return (
    <SectionCard
      title="Quyền đã cấp"
      meta={scopes && <Spec>{scopes.filter((scope) => scope.granted).length} quyền</Spec>}
      className={className}
    >
      {scopes === null ? (
        <NoData />
      ) : (
        <div>
          {scopes.map((scope) => (
            <div
              key={scope.code}
              className={cn(
                'grid grid-cols-[18px_minmax(0,1fr)] items-start gap-x-3 border-t py-3 first:border-t-0 first:pt-0',
                !scope.granted && 'text-muted-foreground',
              )}
            >
              {scope.granted ? (
                <Check className="mt-0.5 size-4.5" strokeWidth={1.6} />
              ) : (
                <X className="mt-0.5 size-4.5 text-subtle-foreground" strokeWidth={1.6} />
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold">{scopeLabel(scope.code)}</span>
                <Spec>{scope.granted ? scope.code : 'không xin'}</Spec>
              </div>
            </div>
          ))}
        </div>
      )}
      {note && <span className="text-sm text-muted-foreground">{note}</span>}
    </SectionCard>
  )
}

// "Xem tất cả" belongs to the Đăng ký screen, not built yet: the button does nothing for now.
export function SitesCard({ sites, className }: { sites: AccountExtras['sites']; className?: string }) {
  return (
    <SectionCard
      title="Website dùng danh tính này"
      meta={
        sites && (
          <Button type="button" variant="ghost" size="sm" className="-mr-2">
            Xem tất cả {sites.total}
            <ChevronRight strokeWidth={1.6} />
          </Button>
        )
      }
      className={className}
    >
      {sites === null ? (
        <NoData />
      ) : (
        <div>
          {sites.items.map((site) => (
            <div
              key={site.domain}
              className="grid grid-cols-[36px_minmax(0,1fr)_auto_auto] items-center gap-x-3.5 border-t py-2.5 first:border-t-0 first:pt-0"
            >
              <span className="grid size-9 place-items-center rounded-sm border bg-raised text-muted-foreground">
                <Globe className="size-4.5" strokeWidth={1.6} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{site.name}</span>
                <Spec className="truncate">
                  {site.domain} · đăng nhập bằng {methodLabel(site.method)}
                </Spec>
              </div>
              {site.sensitive ? <Badge>Độ nhạy cao</Badge> : <span />}
              <Spec>{formatDate(new Date(site.since))}</Spec>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

const HISTORY_COLUMNS = 'grid grid-cols-[56px_minmax(0,1fr)_56px_64px] items-center gap-x-4 [&>*:nth-child(n+3)]:text-right'

export function SyncHistoryCard({
  runs,
  account,
  now,
  className,
}: {
  runs: AccountExtras['syncRuns']
  account: AccountItem
  now: Date
  className?: string
}) {
  const day = runs && syncRunsLabel(runs, now)
  return (
    <SectionCard title="Lịch sử đồng bộ" meta={day && <Spec>{day}</Spec>} className={className}>
      {runs === null ? (
        <NoData />
      ) : (
        <div role="table" aria-label="Các lần đồng bộ" className="font-mono text-xs leading-4 font-medium text-muted-foreground tabular-nums">
          <div role="row" className={cn(HISTORY_COLUMNS, 'pb-2.5 text-[11px] uppercase')}>
            <span role="columnheader">Giờ</span>
            <span role="columnheader">Kết quả</span>
            <span role="columnheader">{isMail(account.provider) ? 'Thư' : 'Tin'}</span>
            <span role="columnheader">Thời gian</span>
          </div>
          {runs.map((run) => {
            const view = syncRunView(run)
            return (
              <div key={run.at} role="row" className={cn(HISTORY_COLUMNS, 'border-t py-2.5')}>
                <span role="cell" className="text-foreground">
                  {view.time}
                </span>
                <span role="cell">
                  <Status tone={view.tone}>{view.result}</Status>
                </span>
                <span role="cell" className="text-foreground">
                  {view.messages}
                </span>
                <span role="cell">{view.duration}</span>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// Icons of the canvas timeline; a granted scope borrows the icon of the channel it opens.
const SCOPE_ICONS: Record<string, LucideIcon> = { 'gmail.send': Send, 'gmail.readonly': Inbox }

function activityIcon(item: AccountActivity): LucideIcon {
  switch (item.kind) {
    case 'SCOPE_GRANTED':
      return SCOPE_ICONS[item.scope] ?? Key
    case 'SITES_DETECTED':
      return Key
    case 'ACCOUNT_CONNECTED':
      return Link
    case 'AUTH_EXPIRED':
      return TriangleAlert
  }
}

export function ActivityCard({
  activity,
  account,
  nameOf,
  className,
}: {
  activity: AccountExtras['activity']
  account: AccountItem
  nameOf: ProviderNameOf
  className?: string
}) {
  return (
    <SectionCard title="Hoạt động" className={className}>
      {activity === null ? (
        <NoData />
      ) : (
        <ol>
          {activity.map((item) => {
            const Icon = activityIcon(item)
            return (
              <li
                key={item.id}
                className="grid grid-cols-[84px_16px_minmax(0,1fr)] items-start gap-x-2.5 border-t py-2.75 first:border-t-0 first:pt-0"
              >
                <Spec className="leading-5 whitespace-nowrap">{stampLabel(item.at)}</Spec>
                <Icon className="mt-0.5 size-4 text-muted-foreground" strokeWidth={1.6} />
                <span className="text-sm">{accountActivityText(item, account, nameOf)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </SectionCard>
  )
}
