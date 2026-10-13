import { Bell, Calendar, Check, ChevronRight, Repeat, SquareCheck } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { formatClock, formatDayMonth, formatIn, weekdayName } from '@/shared/time/local'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { itemTimeLabel, overdueText, recurrenceLabel, todayCounts } from '../format'
import type { TodayItem, TodaySummary } from '../overview.types'
import { Card, Hairline, NoData, Spec } from './Card'

// Canvas `Dashboard` "Hôm nay": tasks, appointments and reminders of the day, then a line about tomorrow.
export function TodayCard({ today, now, className }: { today: TodaySummary | null; now: Date; className?: string }) {
  const title = `Hôm nay · ${weekdayName(now)} ${formatDayMonth(now)}`

  if (!today) {
    return (
      <Card surface="bento" title={title} className={cn('gap-3.5', className)}>
        <NoData />
      </Card>
    )
  }

  return (
    <Card surface="bento" title={title} meta={<Spec>{todayCounts(today.items)}</Spec>} className={cn('gap-3.5', className)}>
      <div className="-mx-3 flex flex-col gap-0.5">
        {today.items.map((item) => (
          <TodayRow key={item.id} item={item} now={now} />
        ))}
      </div>
      <Hairline className="mt-auto" />
      <div className="flex items-center justify-between gap-3">
        <TomorrowLine tomorrow={today.tomorrow} />
        <Button asChild variant="ghost" size="sm" className="-mr-2">
          <Link to="/calendar">
            Mở lịch
            <ChevronRight strokeWidth={1.6} />
          </Link>
        </Button>
      </div>
    </Card>
  )
}

const ICONS = { TASK: SquareCheck, EVENT: Calendar, REMINDER: Bell }

function TodayRow({ item, now }: { item: TodayItem; now: Date }) {
  const overdue = overdueText(item, now)
  const Icon = item.done ? Check : ICONS[item.kind]
  const upcoming = item.kind === 'EVENT' && new Date(item.at) > now

  return (
    <div className="grid grid-cols-[52px_18px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-sm px-3 py-2.5 transition-colors duration-(--dur-hover) ease-out hover:bg-hover">
      <Spec className={overdue ? 'text-danger-ink' : 'text-foreground'}>{itemTimeLabel(item, now)}</Spec>
      <Icon className={cn('size-4.5', overdue ? 'text-danger-ink' : 'text-muted-foreground')} strokeWidth={1.6} />
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <span className={cn('max-w-full truncate text-sm font-semibold', item.done && 'text-subtle-foreground line-through')}>
          {item.title}
        </span>
        {overdue && <span className="text-sm text-danger-ink">{overdue}</span>}
        {item.done && <span className="text-sm text-muted-foreground">Đã xong</span>}
        {!overdue && !item.done && item.conversation && (
          <span className="inline-flex h-5.5 max-w-70 items-center gap-1.5 overflow-hidden rounded-xs border bg-raised pr-2 pl-0.75 text-[11px] leading-4 font-medium whitespace-nowrap text-muted-foreground">
            <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-surface text-foreground">
              <ProviderIcon provider={item.conversation.provider} className="size-2.75" />
            </span>
            <span className="truncate">{item.conversation.title}</span>
          </span>
        )}
        {!overdue && !item.done && item.recurrence && (
          <span className="inline-flex items-center gap-1.25 text-xs leading-4 font-medium whitespace-nowrap text-muted-foreground">
            <Repeat className="size-3.25" strokeWidth={1.6} />
            {recurrenceLabel(item.recurrence)}
          </span>
        )}
      </div>
      {item.kind === 'TASK' && !item.done && (
        <button
          type="button"
          aria-label="Đánh dấu xong"
          className={cn(
            'grid size-5.5 cursor-pointer place-items-center rounded-full border-[1.5px] border-border-strong text-transparent transition-colors duration-(--dur-hover) ease-out outline-none hover:border-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
            overdue && 'border-danger',
          )}
        >
          <Check className="size-3" strokeWidth={2.6} />
        </button>
      )}
      {upcoming && <Spec>{formatIn(new Date(item.at), now)}</Spec>}
    </div>
  )
}

function TomorrowLine({ tomorrow }: { tomorrow: TodaySummary['tomorrow'] }) {
  const tasks = tomorrow.taskCount > 0 ? `${tomorrow.taskCount} việc` : null
  return (
    <span className="text-sm text-muted-foreground">
      Ngày mai:{' '}
      {tomorrow.firstEvent ? (
        <>
          <span className="font-semibold text-foreground">{tomorrow.firstEvent.title}</span>{' '}
          {formatClock(new Date(tomorrow.firstEvent.at))}
          {tasks && ` · ${tasks}`}
        </>
      ) : (
        (tasks ?? 'trống')
      )}
    </span>
  )
}
