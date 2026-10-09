import { Link, useParams } from 'react-router'
import { providerNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { CalendarHeader, CalendarLegend } from './components/CalendarHeader'
import { AgendaView } from './components/AgendaView'
import { EventDetail } from './components/EventDetail'
import { MonthView } from './components/MonthView'
import { WeekView } from './components/WeekView'
import { calendarHead, rangeOf, timeZoneLabel } from './format'
import { useCalendar, useCalendarView } from './useCalendar'

/**
 * The Lịch screen (canvas `Calendar`): the head of the range with its views, the legend, the week, the month or the
 * agenda, and the open appointment in the right column from 1280 px. `/calendar/:itemId` opens an appointment; below
 * 1280 px its detail takes the place of the calendar (as the tasks screen, D-82). The view and the day live in the
 * address (D-87).
 */
export function CalendarPage() {
  const { itemId } = useParams()
  const { view, anchor, today, search, setView, shift, goToday } = useCalendarView()
  const range = rangeOf(view, anchor)
  const { data, receivedAt } = useCalendar(range)
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const head = calendarHead(view, anchor, today)
  const selected = itemId === undefined ? undefined : data?.events.find((event) => event.id === itemId)
  const nameOf = providerNameOf(data?.providers ?? [])

  return (
    <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Lịch" className={cn('min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)]', itemId ? 'hidden xl:grid' : 'grid')}>
        <CalendarHeader kicker={head.kicker} title={head.title} view={view} onView={setView} onShift={shift} onToday={goToday} />
        <CalendarLegend timeZone={timeZoneLabel(now)} />
        {!data ? (
          <p role="status" className="p-8 text-sm text-muted-foreground">
            Đang tải…
          </p>
        ) : view === 'week' ? (
          <WeekView data={data} range={range} title={head.title} today={today} now={now} selectedId={itemId} search={search} />
        ) : view === 'month' ? (
          <MonthView data={data} range={range} title={head.title} anchor={anchor} today={today} now={now} search={search} />
        ) : (
          <AgendaView data={data} now={now} search={search} />
        )}
      </section>

      <aside
        aria-label="Chi tiết lịch hẹn"
        className={cn('min-h-0 flex-col gap-5 overflow-auto border-l bg-surface p-7 *:shrink-0', itemId ? 'flex' : 'hidden xl:flex')}
      >
        {selected ? (
          <EventDetail key={selected.id} event={selected} now={now} nameOf={nameOf} close={`/calendar${search}`} />
        ) : itemId && data ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-base">Không tìm thấy lịch hẹn này.</p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/calendar">Về lịch</Link>
            </Button>
          </div>
        ) : (
          !itemId && <p className="m-auto text-sm text-muted-foreground">Chọn một lịch hẹn để xem chi tiết.</p>
        )}
      </aside>
    </div>
  )
}
