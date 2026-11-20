import { Link, useLocation, useMatch, useNavigate, useParams } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { providerNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { timeZoneLabel } from '@/shared/time/local'
import { addDays } from '@/shared/time/localDate'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import type { StoredEvent } from './calendar.types'
import { AgendaView } from './components/AgendaView'
import { CalendarHeader, CalendarLegend } from './components/CalendarHeader'
import { CalendarLoadFailed, CalendarSkeleton } from './components/CalendarStates'
import { EventDetail } from './components/EventDetail'
import { EventFormDialog, EventFormPage, type EventFormState } from './components/EventForm'
import { MobileCalendar } from './components/MobileCalendar'
import { MonthView } from './components/MonthView'
import { WeekView } from './components/WeekView'
import { formOfEvent } from './eventForm'
import { calendarHead, rangeOf } from './format'
import { useCalendar, useCalendarView, useEvent } from './useCalendar'

// A phone shows two weeks of agenda from the picked day under the strip of its week.
const AGENDA_DAYS = 14

/**
 * The Lịch screen (canvas `Calendar`, `MobileCalendar`). From 768 px: the head of the range with its views, the legend,
 * the week, the month or the agenda, and from 1280 px a right column for the open appointment, only while one is open
 * (below that its detail takes the place of the calendar, as the tasks screen, D-82). Below 768 px the layout and the days it asks for differ
 * (a week strip over the agenda), so the page picks one in JavaScript rather than drawing both and hiding one.
 * `/calendar/:itemId` opens an appointment; `/calendar/new` and `/calendar/:itemId/edit` open the appointment form (a
 * dialog from 768 px, a page of its own below, D-158); the view and the day live in the address (D-87).
 */
export function CalendarPage() {
  const { itemId } = useParams()
  const creating = useMatch('/calendar/new') !== null
  const editing = useMatch('/calendar/:itemId/edit') !== null
  const location = useLocation()
  const navigate = useNavigate()
  const { view, anchor, today, search, setView, pickDay, shift, goToday } = useCalendarView()
  const wide = useMediaQuery('(min-width: 768px)')
  const week = rangeOf('week', anchor)
  const range = wide ? rangeOf(view, anchor) : { from: week.from, to: addDays(anchor, AGENDA_DAYS) }
  const defaultDate = range.from <= today && today < range.to ? today : anchor
  const { data, receivedAt, error, retry } = useCalendar(range)
  const selected = itemId === undefined ? undefined : data?.events.find((event) => event.id === itemId)
  const eventId = selected?.eventId ?? (itemId ? itemId.split('@')[0] : undefined)
  const { event: series } = useEvent(editing ? eventId : undefined)
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const head = calendarHead(view, anchor, today)
  const nameOf = providerNameOf(data?.providers ?? [])
  const close = `/calendar${search}`
  const newEvent = `/calendar/new${search}`
  const detailPath = `/calendar/${itemId}${search}`
  const editPath = `/calendar/${itemId}/edit${search}`

  const closeCreate = () => ((location.state as EventFormState | null)?.fromCalendar ? navigate(-1) : navigate(close, { replace: true }))
  const closeEdit = (saved?: StoredEvent) => {
    if (saved && series) {
      const oldDate = formOfEvent(series).date
      const newDate = formOfEvent(saved).date
      if (itemId === `${saved.id}@${oldDate}` && newDate && newDate !== oldDate) {
        navigate(`/calendar/${saved.id}@${newDate}${search}`, { replace: true })
        return
      }
    }
    if ((location.state as EventFormState | null)?.fromDetail) {
      navigate(-1)
    } else {
      navigate(detailPath, { replace: true })
    }
  }

  if (!data) {
    return error ? <CalendarLoadFailed onRetry={retry} /> : <CalendarSkeleton />
  }

  if (creating && !wide) {
    return <EventFormPage defaultDate={defaultDate} back={close} onClose={() => closeCreate()} />
  }

  if (editing && series && !wide) {
    return <EventFormPage key={series.id} event={series} defaultDate={defaultDate} back={detailPath} onClose={closeEdit} />
  }

  const detail = selected ? (
    <EventDetail key={selected.id} event={selected} now={now} nameOf={nameOf} close={close} edit={editPath} />
  ) : (
    <div className="flex flex-col items-start gap-3">
      <p className="text-base">Không tìm thấy lịch hẹn này.</p>
      <Button asChild variant="secondary" size="sm">
        <Link to="/calendar">Về lịch</Link>
      </Button>
    </div>
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
    <div className={cn('grid h-full min-h-0 gap-3 p-3', itemId && 'xl:grid-cols-[minmax(0,1fr)_340px]')}>
      <section aria-label="Lịch" className={cn('min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-panel bg-surface shadow-card', itemId ? 'hidden xl:grid' : 'grid')}>
        <CalendarHeader kicker={head.kicker} title={head.title} view={view} newEvent={newEvent} onView={setView} onShift={shift} onToday={goToday} />
        <CalendarLegend timeZone={timeZoneLabel(now)} />
        {view === 'week' ? (
          <WeekView data={data} range={range} title={head.title} today={today} now={now} selectedId={itemId} search={search} />
        ) : view === 'month' ? (
          <MonthView data={data} range={range} title={head.title} anchor={anchor} today={today} now={now} search={search} />
        ) : (
          <AgendaView data={data} now={now} search={search} />
        )}
      </section>

      {itemId && (
        <aside aria-label="Chi tiết lịch hẹn" className="flex min-h-0 flex-col gap-5 overflow-auto rounded-panel bg-surface p-7 shadow-card *:shrink-0">
          {detail}
        </aside>
      )}
      {creating && <EventFormDialog defaultDate={defaultDate} onClose={() => closeCreate()} />}
      {editing && series && <EventFormDialog key={series.id} event={series} defaultDate={defaultDate} onClose={closeEdit} />}
    </div>
  )
}
