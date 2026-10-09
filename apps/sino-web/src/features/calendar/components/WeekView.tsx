import { Bell, Check, Repeat, SquareCheck } from 'lucide-react'
import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { Link } from 'react-router'
import type { LocalDate } from '@/shared/domain'
import { cn } from '@/shared/lib/utils'
import { formatClock } from '@/shared/time/local'
import { localDateOf } from '@/shared/time/localDate'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import type { CalendarData, CalendarEvent, CalendarRange, CalendarTask } from '../calendar.types'
import { HOUR_PX, itemsOfDay, minuteTop, placeTimedEvents, weekDays } from '../format'

const HOURS = Array.from({ length: 23 }, (_, index) => index + 1)
// Where the grid opens: 06:00 at the top, as the canvas draws it (D-88), with room for its label.
const OPEN_AT = 6 * HOUR_PX - 10
const COLUMNS = 'grid grid-cols-[56px_repeat(7,minmax(0,1fr))]'

/** An open task that is late or one that is done, for the chips (`data-tone`). */
function taskTone(task: CalendarTask, now: Date): 'over' | 'done' | undefined {
  if (task.status === 'DONE') {
    return 'done'
  }
  const late = task.dueAt ? Date.parse(task.dueAt) < now.getTime() : task.dueDate !== null && task.dueDate < localDateOf(now)
  return late ? 'over' : undefined
}

const CHIP =
  'flex h-5.5 items-center gap-1.5 rounded-xs border border-dashed border-border-strong bg-surface px-1.5 text-[11px] leading-3.5 font-medium text-foreground outline-none hover:border-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid data-[tone=done]:text-subtle-foreground data-[tone=done]:line-through data-[tone=over]:border-[color-mix(in_srgb,var(--danger)_60%,var(--border))] data-[tone=over]:text-danger-ink [&_svg]:size-3 [&_svg]:shrink-0'

function TaskChip({ task, now, className, style }: { task: CalendarTask; now: Date; className?: string; style?: CSSProperties }) {
  const tone = taskTone(task, now)
  return (
    <Link to={`/tasks/${task.taskId}`} data-tone={tone} style={style} className={cn(CHIP, className)}>
      {tone === 'done' ? <Check aria-hidden="true" strokeWidth={1.6} /> : <SquareCheck aria-hidden="true" strokeWidth={1.6} />}
      <span className="truncate">{task.title}</span>
    </Link>
  )
}

/**
 * Canvas `.wk`: the seven days, the whole-day row, and the hour grid of the whole day opened at 06:00 (D-88):
 * appointments as blocks (side by side when they meet), tasks with a due time as chips, reminders as marks, and the
 * line of now on today. Appointments open their detail; tasks and reminders open the task (D-85).
 */
export function WeekView({
  data,
  range,
  title,
  today,
  now,
  selectedId,
  search,
}: {
  data: CalendarData
  range: CalendarRange
  title: string
  today: LocalDate
  now: Date
  selectedId: string | undefined
  search: string
}) {
  const scroll = useRef<HTMLDivElement>(null)
  const days = weekDays(range, today)

  useLayoutEffect(() => {
    if (scroll.current) {
      scroll.current.scrollTop = OPEN_AT
    }
  }, [])

  return (
    <section aria-label={`Tuần ${title}`} className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]">
      <div className={cn(COLUMNS, 'border-b')}>
        <span />
        {days.map((day) => (
          <div
            key={day.date}
            aria-current={day.today ? 'date' : undefined}
            className={cn(
              'flex items-baseline gap-1.5 border-l px-2.5 pt-2.5 pb-2 text-xs leading-4 font-medium text-muted-foreground',
              day.today && 'items-center font-semibold text-foreground',
            )}
          >
            <span>{day.label}</span>
            <span
              className={cn(
                'text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground',
                day.past && 'text-muted-foreground',
                day.today && 'inline-grid h-7.5 min-w-7.5 place-items-center rounded-full bg-primary px-1.5 text-primary-foreground',
              )}
            >
              {day.num}
            </span>
          </div>
        ))}
      </div>

      <div className={cn(COLUMNS, 'border-b')}>
        <span className="pt-2.25 pr-2 text-right font-mono text-[10px] leading-3.5 font-medium text-subtle-foreground">cả ngày</span>
        {days.map((day) => (
          <div key={day.date} className="flex min-h-8.5 flex-col gap-1 border-l px-1 py-1.25">
            {itemsOfDay(data, day.date).allDay.map((item) =>
              'eventId' in item ? (
                <Link
                  key={item.id}
                  to={{ pathname: `/calendar/${item.id}`, search }}
                  aria-current={item.id === selectedId ? 'page' : undefined}
                  className="flex h-5.5 items-center gap-1.5 overflow-hidden rounded-xs border border-border-strong bg-raised px-2 text-[11px] leading-3.5 font-semibold whitespace-nowrap text-foreground outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid aria-[current=page]:border-foreground"
                >
                  {item.recurrence && <Repeat aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.6} />}
                  <span className="truncate">{item.title}</span>
                </Link>
              ) : (
                <TaskChip key={item.id} task={item} now={now} />
              ),
            )}
          </div>
        ))}
      </div>

      <div ref={scroll} className="min-h-0 overflow-auto">
        <div className={COLUMNS} style={{ height: 24 * HOUR_PX }}>
          <div className="relative">
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1.75 font-mono text-[10px] leading-3.5 font-medium text-subtle-foreground"
                style={{ top: hour * HOUR_PX }}
              >
                {`${String(hour).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const items = itemsOfDay(data, day.date)
            return (
              <div
                key={day.date}
                className={cn(
                  'relative border-l bg-[repeating-linear-gradient(to_bottom,var(--border)_0,var(--border)_1px,transparent_1px,transparent_46px)]',
                  day.today && 'bg-[color-mix(in_srgb,var(--text)_3%,transparent)]',
                )}
              >
                {placeTimedEvents(items.timed, day.date).map((placed) => (
                  <EventBlock
                    key={placed.event.id}
                    event={placed.event}
                    selected={placed.event.id === selectedId}
                    past={Date.parse(placed.event.endsAt!) < now.getTime()}
                    search={search}
                    style={{
                      top: placed.top,
                      height: placed.height,
                      left: `calc(${placed.column} * 100% / ${placed.columns} + 4px)`,
                      width: `calc(100% / ${placed.columns} - 8px)`,
                    }}
                  />
                ))}
                {items.chips.map((task) => (
                  <TaskChip key={task.id} task={task} now={now} className="absolute inset-x-1" style={{ top: minuteTop(task.dueAt!, day.date) + 2 }} />
                ))}
                {items.reminders.map((reminder) => (
                  <Link
                    key={reminder.id}
                    to={`/tasks/${reminder.taskId}`}
                    style={{ top: minuteTop(reminder.at, day.date) }}
                    className="absolute inset-x-1 flex items-center gap-1.25 overflow-hidden border-t border-dashed border-muted-foreground pt-0.5 font-mono text-[10px] leading-3.5 font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
                  >
                    <Bell aria-hidden="true" className="size-2.75 shrink-0" strokeWidth={1.6} />
                    {`${formatClock(new Date(reminder.at))} ${reminder.taskTitle}`}
                  </Link>
                ))}
                {day.today && (
                  <span
                    role="img"
                    aria-label={`Bây giờ ${formatClock(now)}`}
                    style={{ top: minuteTop(now.toISOString(), day.date) }}
                    className="pointer-events-none absolute right-0 -left-px z-2 border-t-2 border-foreground before:absolute before:-top-1.5 before:-left-1.25 before:size-2.5 before:rounded-full before:bg-foreground before:content-['']"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// Canvas `.ev`: title, time (with the repeat mark), source; a past one is faded, the open one outlined.
function EventBlock({
  event,
  selected,
  past,
  search,
  style,
}: {
  event: CalendarEvent
  selected: boolean
  past: boolean
  search: string
  style: CSSProperties
}) {
  return (
    <Link
      to={{ pathname: `/calendar/${event.id}`, search }}
      aria-current={selected ? 'page' : undefined}
      data-past={past ? 'true' : undefined}
      style={style}
      // The lines keep their height: a one-hour block shows its title first and cuts what does not fit at the bottom.
      className="absolute flex flex-col gap-0.5 overflow-hidden rounded-[8px] border *:shrink-0 border-l-[3px] border-border-strong border-l-foreground bg-raised px-2 py-1.25 text-xs leading-4 font-semibold text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid data-past:opacity-55 aria-[current=page]:border-foreground aria-[current=page]:bg-hover aria-[current=page]:shadow-[0_0_0_1px_var(--text)]"
    >
      <span className="truncate">{event.title}</span>
      <span className="inline-flex items-center gap-1 font-mono text-[10px] leading-3.5 font-medium text-muted-foreground">
        {`${formatClock(new Date(event.startsAt!))} – ${formatClock(new Date(event.endsAt!))}`}
        {event.recurrence && <Repeat aria-hidden="true" className="size-2.75" strokeWidth={1.6} />}
      </span>
      {event.source && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <ProviderIcon provider={event.source.provider} className="size-2.75 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[10px] leading-3.5 font-medium text-muted-foreground">{event.source.title}</span>
        </span>
      )}
    </Link>
  )
}
