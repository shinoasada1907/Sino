import { Link, useParams } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { providerNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { addDays } from '@/shared/time/localDate'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { AgendaView } from './components/AgendaView'
import { CalendarHeader, CalendarLegend } from './components/CalendarHeader'
import { CalendarLoadFailed, CalendarSkeleton } from './components/CalendarStates'
import { EventDetail } from './components/EventDetail'
import { MobileCalendar } from './components/MobileCalendar'
import { MonthView } from './components/MonthView'
import { WeekView } from './components/WeekView'
import { calendarHead, rangeOf, timeZoneLabel } from './format'
import { useCalendar, useCalendarView } from './useCalendar'

// A phone shows two weeks of agenda from the picked day under the strip of its week.
const AGENDA_DAYS = 14

/**
 * The Lịch screen (canvas `Calendar`, `MobileCalendar`). From 768 px: the head of the range with its views, the legend,
 * the week, the month or the agenda, and the open appointment in the right column from 1280 px (below that its detail
 * takes the place of the calendar, as the tasks screen, D-82). Below 768 px the layout and the days it asks for differ
 * (a week strip over the agenda), so the page picks one in JavaScript rather than drawing both and hiding one.
 * `/calendar/:itemId` opens an appointment; the view and the day live in the address (D-87).
 */
export function CalendarPage() {
  const { itemId } = useParams()
  const { view, anchor, today, search, setView, pickDay, shift, goToday } = useCalendarView()
  const wide = useMediaQuery('(min-width: 768px)')
  const week = rangeOf('week', anchor)
  const range = wide ? rangeOf(view, anchor) : { from: week.from, to: addDays(anchor, AGENDA_DAYS) }
  const { data, receivedAt, error, retry } = useCalendar(range)
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const head = calendarHead(view, anchor, today)
  const selected = itemId === undefined ? undefined : data?.events.find((event) => event.id === itemId)
  const nameOf = providerNameOf(data?.providers ?? [])
  const close = `/calendar${search}`

  if (!data) {
    return error ? <CalendarLoadFailed onRetry={retry} /> : <CalendarSkeleton />
  }

  const detail = selected ? (
    <EventDetail key={selected.id} event={selected} now={now} nameOf={nameOf} close={close} />
  ) : itemId ? (
    <div className="flex flex-col items-start gap-3">
      <p className="text-base">Không tìm thấy lịch hẹn này.</p>
      <Button asChild variant="secondary" size="sm">
        <Link to="/calendar">Về lịch</Link>
      </Button>
    </div>
  ) : (
    <p className="m-auto text-sm text-muted-foreground">Chọn một lịch hẹn để xem chi tiết.</p>
  )

  if (!wide) {
    return itemId ? (
      <aside aria-label="Chi tiết lịch hẹn" className="flex h-full min-h-0 flex-col overflow-auto bg-surface">
        <MobilePageHeader back={{ to: close, label: 'Quay lại Lịch' }} title="Chi tiết lịch hẹn" />
        <div className="flex grow flex-col gap-5 p-4 *:shrink-0">{detail}</div>
      </aside>
    ) : (
      <MobileCalendar
        data={data}
        week={week}
        weekTitle={calendarHead('week', anchor, today).title}
        monthKicker={calendarHead('month', anchor, today).kicker}
        anchor={anchor}
        today={today}
        now={now}
        search={search}
        onPick={pickDay}
        onToday={goToday}
      />
    )
  }

  return (
    <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Lịch" className={cn('min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)]', itemId ? 'hidden xl:grid' : 'grid')}>
        <CalendarHeader kicker={head.kicker} title={head.title} view={view} onView={setView} onShift={shift} onToday={goToday} />
        <CalendarLegend timeZone={timeZoneLabel(now)} />
        {view === 'week' ? (
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
        {detail}
      </aside>
    </div>
  )
}
