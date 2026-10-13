import type { Instant, LocalDate, ProviderInfo } from '@/shared/domain'
import type { Recurrence, RelatedItem, TaskSource } from '@/features/tasks/tasks.types'

/**
 * Data contract of the Lịch screen (D-42), handed to the backend for F17 (`GET /api/calendar?from=&to=`); see the change
 * design.md.
 */

/** The days a screen asks for: `from` included, `to` not, in the user's time zone. */
export interface CalendarRange {
  from: LocalDate
  to: LocalDate
}

/** `GET /api/calendar` for a range, and `GET /api/providers` for the names of the sources. */
export interface CalendarData extends CalendarRange {
  generatedAt: Instant
  providers: ProviderInfo[]
  /** Every occurrence that meets the range (D-86). */
  events: CalendarEvent[]
  /** Tasks due in the range, with the coming occurrences of repeating ones; when the range holds today, also the open tasks late from before. */
  tasks: CalendarTask[]
  /** Reminders of tasks in the range; an appointment keeps its own reminder. */
  reminders: CalendarReminder[]
}

/** One occurrence of an appointment. */
export interface CalendarEvent {
  /** Of this occurrence: "event-run@2026-10-04". */
  id: string
  eventId: string
  title: string
  /** Set for a timed appointment, with `endsAt`. */
  startsAt: Instant | null
  endsAt: Instant | null
  /** Set for a whole-day appointment; `endDate` is not included. */
  startDate: LocalDate | null
  endDate: LocalDate | null
  location: string | null
  notes: string | null
  reminder: { at: Instant; offsetMinutes: number; state: 'PENDING' | 'FIRED' } | null
  recurrence: Recurrence | null
  /** `preview`: the start of the message it came from ("Mẹ: Cuối tuần này cả nhà về ăn cơm nhé…"). */
  source: (TaskSource & { preview: string | null }) | null
  related: RelatedItem[] | null
}

/** One occurrence of a task with a due. */
export interface CalendarTask {
  /** Of this occurrence. */
  id: string
  /** The task to open; for an occurrence not made yet, the open task of its series. */
  taskId: string
  title: string
  status: 'OPEN' | 'DONE'
  dueAt: Instant | null
  dueDate: LocalDate | null
  completedAt: Instant | null
  recurrence: Recurrence | null
  source: TaskSource | null
}

export interface CalendarReminder {
  id: string
  taskId: string
  taskTitle: string
  at: Instant
  state: 'PENDING' | 'FIRED'
  source: TaskSource | null
}
