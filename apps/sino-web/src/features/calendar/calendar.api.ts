import { api } from '@/shared/api/client'
import { toProviderInfo, type ProviderEntry } from '@/shared/api/providers'
import type { CalendarData, CalendarRange, EventBody, StoredEvent } from './calendar.types'

/*
 * The requests of the Lịch screen, on the F17 API (BE-73, BE-74). `GET /api/calendar` already answers in the shape of
 * `CalendarData` (without `providers`); reminders, sources and related items are empty or null until the backend has
 * them (D-150), and the screen leaves out what has no data.
 */

const eventPath = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}`

/** `GET /api/calendar?from=&to=` for the range, and `GET /api/providers` for the names of the sources. */
export async function fetchCalendar({ from, to }: CalendarRange): Promise<CalendarData> {
  const query = new URLSearchParams({ from, to })
  const [calendar, providers] = await Promise.all([
    api.get<Omit<CalendarData, 'providers'>>(`/api/calendar?${query}`),
    api.get<ProviderEntry[]>('/api/providers'),
  ])
  return { ...calendar, providers: providers.map(toProviderInfo) }
}

/** `GET /api/events/{id}`: the whole appointment (its first occurrence and its repeat rule). */
export async function fetchEvent(eventId: string): Promise<StoredEvent> {
  return api.get<StoredEvent>(eventPath(eventId))
}

/** `POST /api/events`. */
export async function createEvent(body: EventBody): Promise<StoredEvent> {
  return api.post<StoredEvent>('/api/events', body)
}

/** `PUT /api/events/{id}`: replaces the whole appointment (every occurrence when it repeats, D-151). */
export async function updateEvent(eventId: string, body: EventBody): Promise<StoredEvent> {
  return api.put<StoredEvent>(eventPath(eventId), body)
}

/** `DELETE /api/events/{id}`: deletes the appointment (and all of its occurrences when it repeats). */
export async function deleteEvent(eventId: string): Promise<void> {
  return api.delete(eventPath(eventId))
}
