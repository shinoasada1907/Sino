import { createCalendarSample } from './calendar.sample'
import type { CalendarData, CalendarRange } from './calendar.types'

/*
 * The requests of the Lịch screen. They return sample data until the backend has F17 (D-42); connecting the API means
 * changing only the body below.
 */

/** Later `GET /api/calendar?from=&to=` and `GET /api/providers`. */
export async function fetchCalendar(range: CalendarRange): Promise<CalendarData> {
  return createCalendarSample(new Date(), range)
}
