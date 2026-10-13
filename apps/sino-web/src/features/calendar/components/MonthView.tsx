import { Link } from 'react-router'
import type { LocalDate } from '@/shared/domain'
import { cn } from '@/shared/lib/utils'
import { WEEKDAY_NAMES } from '@/shared/time/local'
import type { CalendarData, CalendarRange } from '../calendar.types'
import { monthCells, monthItems } from '../format'
import { ItemMark } from './ItemMark'

// Monday first (D-89).
const HEADS = [...WEEKDAY_NAMES.slice(1), WEEKDAY_NAMES[0]].map((name) => name.toUpperCase())
// Items a cell shows before "+N mục" (canvas `.mo-cell`: 132 px).
const SHOWN = 3

const ITEM =
  'flex h-5 min-w-0 shrink-0 items-center gap-1.25 overflow-hidden rounded-[5px] px-1.5 text-[11px] leading-3.5 font-medium whitespace-nowrap text-foreground outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid [&_svg]:size-2.75 [&_svg]:text-muted-foreground'
const KIND: Record<'event' | 'task' | 'reminder', string> = {
  event: 'border-l-2 border-foreground bg-raised',
  task: 'border border-dashed border-border-strong',
  reminder: 'pl-0.5 text-muted-foreground',
}

/**
 * Canvas `.mo`: the weeks that meet the month (D-89), today marked, the days outside the month faded; each day lists its
 * items by time (whole-day first) and keeps three of them, with "+N mục" opening that day in the week view.
 */
export function MonthView({
  data,
  range,
  title,
  anchor,
  today,
  now,
  search,
}: {
  data: CalendarData
  range: CalendarRange
  title: string
  anchor: LocalDate
  today: LocalDate
  now: Date
  search: string
}) {
  const cells = monthCells(range, anchor, today)
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))

  return (
    <section aria-label={title} className="min-h-0 overflow-auto">
      <div role="grid" aria-readonly="true" aria-label={title} className="flex min-w-0 flex-col">
        <div role="row" className="sticky top-0 z-1 grid grid-cols-7 border-b bg-background">
          {HEADS.map((head, index) => (
            <span key={head} role="columnheader" className={cn('px-2.5 pt-2.5 pb-2 font-mono text-[11px] leading-4 font-medium text-muted-foreground', index > 0 && 'border-l')}>
              {head}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} role="row" className="grid grid-cols-7">
            {week.map((day, index) => {
              const items = monthItems(data, day.date, now)
              const hidden = items.length - SHOWN
              return (
                <div
                  key={day.date}
                  role="gridcell"
                  data-testid={`day-${day.date}`}
                  data-out={day.out ? 'true' : undefined}
                  aria-current={day.today ? 'date' : undefined}
                  className={cn(
                    'flex min-h-33 min-w-0 flex-col gap-0.75 border-b p-1.5',
                    index > 0 && 'border-l',
                    day.out && 'bg-[color-mix(in_srgb,var(--surface)_50%,transparent)]',
                  )}
                >
                  <span
                    className={cn(
                      'mb-0.5 inline-grid h-6 min-w-6 place-items-center self-start rounded-full px-1 text-xs leading-4 font-semibold text-foreground',
                      day.out && 'text-subtle-foreground',
                      day.today && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {day.num}
                  </span>
                  {items.slice(0, SHOWN).map((item) => (
                    <Link
                      key={item.id}
                      to={item.kind === 'event' ? { pathname: item.to, search } : item.to}
                      data-tone={item.tone ?? undefined}
                      className={cn(
                        ITEM,
                        KIND[item.kind],
                        'data-[tone=done]:text-subtle-foreground data-[tone=done]:line-through data-[tone=over]:border-[color-mix(in_srgb,var(--danger)_60%,var(--border))] data-[tone=over]:text-danger-ink',
                      )}
                    >
                      <ItemMark icon={item.icon} provider={item.provider} />
                      <span className="truncate">{item.text}</span>
                    </Link>
                  ))}
                  {hidden > 0 && (
                    <Link
                      to={{ search: `?date=${day.date}` }}
                      className="h-5 shrink-0 rounded-[5px] px-1.5 text-[11px] leading-5 font-medium text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
                    >
                      {`+${hidden} mục`}
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
