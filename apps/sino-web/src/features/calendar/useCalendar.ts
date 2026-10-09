import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import type { LocalDate } from '@/shared/domain'
import { localDateOf } from '@/shared/time/localDate'
import { useNow } from '@/shared/time/useNow'
import { fetchCalendar } from './calendar.api'
import type { CalendarData, CalendarRange } from './calendar.types'
import { shiftAnchor, type CalendarView } from './format'

export const calendarKey = ({ from, to }: CalendarRange) => ['calendar', from, to] as const

export interface CalendarQuery {
  data: CalendarData | undefined
  /** When the data arrived (milliseconds since the epoch, 0 before any data). */
  receivedAt: number
  error: Error | null
  retry: () => void
}

/** The calendar of a range; the range shown before stays on screen while the next one loads. */
export function useCalendar(range: CalendarRange): CalendarQuery {
  const { data, dataUpdatedAt, error, refetch } = useQuery({
    queryKey: calendarKey(range),
    queryFn: () => fetchCalendar(range),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
  return { data, receivedAt: dataUpdatedAt, error, retry: () => void refetch() }
}

const VIEWS: CalendarView[] = ['week', 'month', 'agenda']
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The view and the day of the calendar live in the address (`?view=month&date=2026-10-09`, D-87), so a reload, Back and
 * a shared link keep them: the week of today leaves the address clean, and an unknown value falls back to it.
 */
export function useCalendarView(): {
  view: CalendarView
  anchor: LocalDate
  today: LocalDate
  /** The query of the address, for links that keep the view and the day. */
  search: string
  setView: (view: CalendarView) => void
  shift: (step: -1 | 1) => void
  goToday: () => void
} {
  const [params, setParams] = useSearchParams()
  const today = localDateOf(useNow())
  const viewParam = params.get('view') as CalendarView | null
  const view = viewParam && VIEWS.includes(viewParam) ? viewParam : 'week'
  const dateParam = params.get('date')
  const date = dateParam && LOCAL_DATE.test(dateParam) ? dateParam : null
  const anchor = date ?? today
  const write = (next: { view: CalendarView; date: LocalDate | null }) => {
    const query = new URLSearchParams()
    if (next.view !== 'week') {
      query.set('view', next.view)
    }
    if (next.date) {
      query.set('date', next.date)
    }
    setParams(query)
  }
  const search = (() => {
    const query = new URLSearchParams()
    if (view !== 'week') {
      query.set('view', view)
    }
    if (date) {
      query.set('date', date)
    }
    const text = query.toString()
    return text ? `?${text}` : ''
  })()
  return {
    view,
    anchor,
    today,
    search,
    setView: (next) => write({ view: next, date }),
    shift: (step) => write({ view, date: shiftAnchor(view, anchor, step) }),
    goToday: () => write({ view, date: null }),
  }
}
