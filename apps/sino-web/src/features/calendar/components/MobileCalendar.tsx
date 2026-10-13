import { Plus } from 'lucide-react'
import type { LocalDate } from '@/shared/domain'
import { cn } from '@/shared/lib/utils'
import { WEEKDAY_NAMES } from '@/shared/time/local'
import { dayMonthOfDate, weekdayOfDate } from '@/shared/time/localDate'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import type { CalendarData, CalendarRange } from '../calendar.types'
import { itemsOfDay, weekDays } from '../format'
import { AgendaView } from './AgendaView'

// Dots under a day of the strip: one a item, three at most (canvas `.mw-dots`).
const MAX_DOTS = 3

/**
 * Canvas `MobileCalendar`: "Lịch" with the month, "Hôm nay", "Thêm lịch hẹn" (no flow yet, D-85), the seven days of the
 * week with a dot for each item, and the agenda from the picked day.
 */
export function MobileCalendar({
  data,
  week,
  weekTitle,
  monthKicker,
  anchor,
  today,
  now,
  search,
  onPick,
  onToday,
}: {
  data: CalendarData
  week: CalendarRange
  weekTitle: string
  monthKicker: string
  anchor: LocalDate
  today: LocalDate
  now: Date
  search: string
  onPick: (day: LocalDate) => void
  onToday: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-15 shrink-0 items-center gap-1 py-2 pr-2 pl-4">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">Lịch</h1>
        <Spec className="ml-2.5 pt-1.5">{monthKicker}</Spec>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onToday}>
          Hôm nay
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Thêm lịch hẹn">
          <Plus strokeWidth={1.6} />
        </Button>
      </header>
      <div role="group" aria-label={`Tuần ${weekTitle}`} className="grid shrink-0 grid-cols-7 gap-1 px-3 pb-3">
        {weekDays(week, today).map((day) => {
          const { allDay, timed, chips, reminders } = itemsOfDay(data, day.date)
          const count = allDay.length + timed.length + chips.length + reminders.length
          const name = `${WEEKDAY_NAMES[weekdayOfDate(day.date)]} ${dayMonthOfDate(day.date)}`
          return (
            <button
              key={day.date}
              type="button"
              aria-label={count > 0 ? `${name}, ${count} mục` : name}
              aria-pressed={day.date === anchor}
              aria-current={day.today ? 'date' : undefined}
              onClick={() => onPick(day.date)}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-0.75 rounded-xl pt-2 pb-1.75 text-[11px] leading-3.5 font-medium text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:ring-1 aria-pressed:ring-border-strong',
                day.today && 'bg-primary text-primary-foreground',
              )}
            >
              <span>{day.label}</span>
              <span className={cn('text-base leading-5 font-semibold text-foreground', day.today && 'text-primary-foreground')}>{day.num}</span>
              <span aria-hidden="true" className="flex h-1 gap-0.75">
                {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, index) => (
                  <span key={index} className="size-1 rounded-full bg-current opacity-70" />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <AgendaView data={data} now={now} from={anchor} search={search} compact className="grow border-t" />
    </div>
  )
}
