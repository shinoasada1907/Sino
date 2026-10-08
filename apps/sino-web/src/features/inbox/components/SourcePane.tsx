import { Archive, CalendarClock, Clock, Inbox, Paperclip, Plus, Send, type LucideIcon } from 'lucide-react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { StatusDot, type StatusTone } from '@/shared/ui/status'
import type { InboxFilter, InboxView } from '../format'
import type { InboxAccount, InboxData } from '../inbox.types'
import { MailDot } from './icons'

const ITEM =
  'grid h-11 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-sm border border-transparent px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-[current=page]:border-border aria-[current=page]:bg-raised aria-[current=page]:font-semibold aria-[current=page]:text-foreground'

const QUICK_FILTERS: { view: InboxView; label: string; icon: LucideIcon | ComponentType<SVGProps<SVGSVGElement>>; count?: keyof InboxData['counts'] }[] = [
  { view: 'unread', label: 'Chưa đọc', icon: MailDot, count: 'unread' },
  { view: 'reply', label: 'Cần trả lời', icon: Send, count: 'needsReply' },
  { view: 'attachments', label: 'Có tệp', icon: Paperclip, count: 'withAttachments' },
  { view: 'scheduled', label: 'Đã hẹn giờ', icon: CalendarClock, count: 'scheduled' },
  { view: 'snoozed', label: 'Đang tạm ẩn', icon: Clock, count: 'snoozed' },
  { view: 'archived', label: 'Đã lưu trữ', icon: Archive },
]

function accountTone(account: InboxAccount): StatusTone {
  if (account.status === 'AUTH_EXPIRED' || account.status === 'ERROR') {
    return 'err'
  }
  if (account.status === 'DEGRADED' || account.syncProgress !== null) {
    return 'warn'
  }
  return account.status === 'DISABLED' ? 'off' : 'ok'
}

/** The left column of the canvas `Inbox`: sources, quick filters, accounts and their state, "Thêm nguồn". */
export function SourcePane({
  inbox,
  filter,
  searchFor,
  nameOf,
  className,
}: {
  inbox: InboxData
  filter: InboxFilter
  searchFor: (change: Partial<InboxFilter>) => string
  nameOf: ProviderNameOf
  className?: string
}) {
  const unreadOf = (provider: string) => inbox.counts.byProvider.find((entry) => entry.provider === provider)?.unread ?? 0
  // A source whose accounts all need signing in again shows a red dot instead of a count, as the canvas does.
  const needsLogin = (provider: string) => {
    const accounts = inbox.accounts.filter((account) => account.provider === provider)
    return accounts.length > 0 && accounts.every((account) => account.status === 'AUTH_EXPIRED')
  }

  return (
    <aside aria-label="Nguồn và bộ lọc" className={cn('min-h-0 overflow-auto border-r', className)}>
      <div className="flex flex-col gap-6 px-3 py-5">
        <Section title="Nguồn">
          <Link to={{ search: searchFor({ source: null }) }} aria-current={filter.source === null ? 'page' : undefined} className={ITEM}>
            <Inbox className="size-4.5 justify-self-center" strokeWidth={1.6} />
            <span>Tất cả</span>
            <Count value={inbox.counts.unread} />
          </Link>
          {inbox.providers.map((provider) => (
            <Link
              key={provider.type}
              to={{ search: searchFor({ source: provider.type }) }}
              aria-current={filter.source === provider.type ? 'page' : undefined}
              className={ITEM}
            >
              <span className="grid size-6 place-items-center rounded-[7px] border bg-raised text-foreground">
                <ProviderIcon provider={provider.type} className="size-3.5" />
              </span>
              <span>{nameOf(provider.type)}</span>
              {needsLogin(provider.type) ? (
                <span className="justify-self-center">
                  <StatusDot tone="err" />
                  <span className="sr-only">cần đăng nhập lại</span>
                </span>
              ) : (
                <Count value={unreadOf(provider.type)} />
              )}
            </Link>
          ))}
        </Section>

        <Section title="Lọc nhanh">
          {QUICK_FILTERS.map(({ view, label, icon: Icon, count }) => (
            <Link key={view} to={{ search: searchFor({ view }) }} aria-current={filter.view === view ? 'page' : undefined} className={ITEM}>
              <Icon className="size-4.5 justify-self-center" strokeWidth={1.6} />
              <span>{label}</span>
              {count ? <Count value={inbox.counts[count] as number} /> : <span />}
            </Link>
          ))}
        </Section>

        <Section title="Tài khoản">
          {inbox.accounts.map((account) => (
            <Link key={account.id} to={`/accounts/${account.id}`} className={ITEM}>
              <StatusDot tone={accountTone(account)} className="justify-self-center" />
              <span className="truncate font-mono text-[11px] leading-4 text-foreground">{account.externalAccountId}</span>
              <span className="font-mono text-[11px] leading-4">{account.syncProgress !== null ? `${account.syncProgress}%` : ''}</span>
            </Link>
          ))}
          <Button asChild variant="ghost" size="sm" className="mt-1.5 justify-start">
            <Link to="/accounts?connect=new">
              <Plus strokeWidth={1.6} />
              Thêm nguồn
            </Link>
          </Button>
        </Section>
      </div>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2.5 pb-2 text-xs leading-4 font-semibold text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}

function Count({ value }: { value: number }) {
  return <span className="ml-auto font-mono text-xs leading-4 font-medium text-muted-foreground">{value > 0 ? value : ''}</span>
}
