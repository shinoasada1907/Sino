import type { CalendarData, CalendarRange } from './calendar.types'

/** Later `GET /api/calendar?from=&to=` and `GET /api/providers`. */
export async function fetchCalendar(range: CalendarRange): Promise<CalendarData> {
  return {
    ...range,
    generatedAt: new Date().toISOString(),
    providers: [],
    events: [],
    tasks: [],
    reminders: [],
  }
}
