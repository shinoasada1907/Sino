import { http, HttpResponse } from 'msw'
import type { CalendarData, CalendarEvent, CalendarTask, StoredEvent } from '@/features/calendar/calendar.types'
import { server } from '@/test/msw/server'

/**
 * `GET /api/calendar?from=2026-09-28&to=2026-10-05` as the backend answers it (F17, BE-74), around Friday 2 October 2026,
 * 14:05 in Vietnam: a weekly appointment (its occurrence this Thursday), a whole-day one, a task due on Monday that
 * repeats (its real task and an occurrence not made yet). Reminders, sources and related items are empty or null.
 */
export const API_WEEK: Omit<CalendarData, 'providers'> = {
  generatedAt: '2026-10-02T07:05:00Z',
  from: '2026-09-28',
  to: '2026-10-05',
  events: [
    event({
      id: 'event-team@2026-10-01',
      eventId: 'event-team',
      title: 'Họp nhóm',
      startsAt: '2026-10-01T03:00:00Z',
      endsAt: '2026-10-01T04:00:00Z',
      location: 'Phòng 3',
      notes: 'Mang laptop.',
      recurrence: { freq: 'WEEKLY', interval: 1, byWeekdays: ['THURSDAY'], byMonthDay: null, untilDate: null, count: null },
    }),
    event({ id: 'event-trip@2026-10-03', eventId: 'event-trip', title: 'Về quê', startDate: '2026-10-03', endDate: '2026-10-05' }),
  ],
  tasks: [
    task({ id: 'task-report', taskId: 'task-report', title: 'Báo cáo tuần', dueAt: '2026-09-28T02:00:00Z' }),
    task({ id: 'task-report@2026-10-05', taskId: 'task-report', title: 'Báo cáo tuần', dueAt: '2026-10-05T02:00:00Z' }),
  ],
  reminders: [],
}

/** An appointment occurrence as the API sends it, with the fields this backend leaves null. */
export function event(fields: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'eventId' | 'title'>): CalendarEvent {
  return {
    startsAt: null,
    endsAt: null,
    startDate: null,
    endDate: null,
    location: null,
    notes: null,
    reminder: null,
    recurrence: null,
    source: null,
    related: null,
    ...fields,
  }
}

/** An empty `GET /api/calendar` for any range, for tests that only pass through the Lịch screen (FE-72). */
export function serveEmptyCalendar() {
  server.use(
    http.get('/api/calendar', ({ request }) => {
      const params = new URL(request.url).searchParams
      return HttpResponse.json({ ...API_WEEK, from: params.get('from'), to: params.get('to'), events: [], tasks: [] })
    }),
  )
}

/** A task occurrence as the API sends it. */
export function task(fields: Partial<CalendarTask> & Pick<CalendarTask, 'id' | 'taskId' | 'title'>): CalendarTask {
  return { status: 'OPEN', dueAt: null, dueDate: null, completedAt: null, recurrence: null, source: null, ...fields }
}

/** A whole appointment as `GET/POST/PUT /api/events` answers it (BE-73). */
export function storedEvent(fields: Partial<StoredEvent> & Pick<StoredEvent, 'id' | 'title'>): StoredEvent {
  return {
    startsAt: null,
    endsAt: null,
    startDate: null,
    endDate: null,
    location: null,
    notes: null,
    reminder: null,
    recurrence: null,
    source: null,
    related: null,
    createdAt: '2026-10-01T01:00:00Z',
    updatedAt: '2026-10-01T01:00:00Z',
    ...fields,
  }
}
