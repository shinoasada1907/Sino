import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Spec } from '@/shared/ui/spec'
import type { LocalDate } from '@/shared/domain'
import type { CalendarData } from '../calendar.types'
import { agendaDays, type AgendaItem } from '../format'
import { ItemMark } from './ItemMark'

/**
 * Canvas `.ag`: the days from the first of the range, each with its items (time, mark, title and source, the note on
 * the right). Appointments open their detail; tasks and reminders open the task. `compact` is the phone's (canvas
 * `.mob .ag-*`): the day on one line above its items, a 48 px time column, and only a late note, under the title.
 */
export function AgendaView({
  data,
  now,
  from,
  search,
  compact = false,
  className,
}: {
  data: CalendarData
  now: Date
  /** The first day shown, when the data starts earlier (the phone loads its whole week). */
  from?: LocalDate
  search: string
  compact?: boolean
  className?: string
}) {
  const days = agendaDays(data, now, undefined, from)

  return (
    <section aria-label="Lịch trình" className={cn('min-h-0 overflow-auto', compact ? 'px-4 pt-1 pb-5' : 'px-6 pt-1 pb-6', className)}>
      {days.length === 0 && <p className="py-6 text-sm text-muted-foreground">Không có gì trong khoảng này.</p>}
      <ol className="m-0 flex list-none flex-col p-0">
        {days.map((day) => (
          <li
            key={day.date}
            data-day={day.date}
            className={cn('grid border-t first:border-t-0', compact ? 'gap-y-2.5 py-3.5' : 'grid-cols-[128px_minmax(0,1fr)] gap-x-6 py-4.5')}
          >
            <div className={cn('flex', compact ? 'items-baseline gap-2' : 'flex-col gap-0.5 pt-2.5')}>
              <span className="text-sm font-semibold">{day.label}</span>
              <Spec>{compact ? day.shortSpec : day.spec}</Spec>
            </div>
            <ul className="m-0 flex min-w-0 list-none flex-col gap-1.5 p-0">
              {day.items.map((item) => (
                <li key={item.id}>
                  <AgendaRow item={item} search={search} compact={compact} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

function AgendaRow({ item, search, compact }: { item: AgendaItem; search: string; compact: boolean }) {
  // The phone keeps only the note that warns (canvas `MobileCalendar`): the others are said by the mark or left out.
  const lateNote = compact && item.note?.tone === 'err' ? item.note.text : null
  return (
    <Link
      to={item.kind === 'event' ? { pathname: item.to, search } : item.to}
      className={cn(
        'grid min-h-12 items-center gap-x-3 rounded-sm border bg-surface py-2 text-foreground outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
        compact ? 'grid-cols-[48px_16px_minmax(0,1fr)] px-3' : 'grid-cols-[104px_18px_minmax(0,1fr)_auto] px-3.5',
        item.kind === 'event' && 'border-l-[3px] border-l-foreground',
        item.kind === 'task' && 'border-dashed',
        item.over && 'border-[color-mix(in_srgb,var(--danger)_55%,var(--border))]',
        item.kind === 'reminder' && 'bg-transparent',
      )}
    >
      <Spec className="text-foreground">{compact ? item.shortTime : item.time}</Spec>
      <ItemMark icon={item.icon} provider={item.provider} className={cn('text-muted-foreground', compact ? 'size-4' : 'size-4.5')} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className={cn('text-sm font-semibold', item.done && 'text-subtle-foreground line-through')}>{item.title}</span>
        {(lateNote || item.source) && (
          <span className="flex flex-wrap items-center gap-1.5">
            {lateNote && <span className="text-sm text-danger-ink">{lateNote}</span>}
            {item.source && (
              <span className="inline-flex h-5.5 max-w-70 items-center gap-1.5 rounded-xs border bg-raised pr-2 pl-0.75 text-xs leading-4 font-medium text-muted-foreground">
                <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-surface text-foreground">
                  <ProviderIcon provider={item.source.provider} className="size-2.75" />
                </span>
                <span className="truncate">{item.source.title}</span>
              </span>
            )}
          </span>
        )}
      </span>
      {!compact && <Spec className={cn('text-right', item.note?.tone === 'err' && 'text-danger-ink')}>{item.note?.text ?? ''}</Spec>}
    </Link>
  )
}
