import type { Instant, LocalDate, ProviderInfo, ProviderType } from '@/shared/domain'

/**
 * Data contract of the Việc cần làm screen (D-42), handed to the backend for F16 (`GET /api/tasks`); see the change
 * design.md.
 */

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

/** `GET /api/tasks` (open tasks, and tasks done in the last 7 days) and `GET /api/providers` (names of the sources). */
export interface TasksData {
  generatedAt: Instant
  providers: ProviderInfo[]
  tasks: TaskItem[]
}

export interface Recurrence {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  /** Every N days, weeks, months or years. */
  interval: number
  /** For WEEKLY. */
  byWeekdays: Weekday[] | null
  /** For MONTHLY: the day of the first occurrence, kept when a month is shorter. */
  byMonthDay: number | null
  untilDate: LocalDate | null
  count: number | null
}

/** Where a task was made from: a message or a conversation of the inbox. */
export interface TaskSource {
  kind: 'MESSAGE' | 'CONVERSATION'
  id: string
  /** Opens the conversation in the inbox. */
  conversationId: string
  provider: ProviderType
  /** The sender or the conversation. */
  title: string
  /** Email subject; null for chats. */
  subject: string | null
  /** The message was removed. */
  missing: boolean
}

export interface RelatedItem {
  kind: 'TASK' | 'EVENT' | 'NOTE'
  id: string
  title: string
  at: Instant | null
  allDay: boolean
}

export interface TaskItem {
  id: string
  title: string
  notes: string | null
  status: 'OPEN' | 'DONE'
  /** A due time; at most one of `dueAt` and `dueDate` is set (D-81). */
  dueAt: Instant | null
  /** A due day for the whole day. */
  dueDate: LocalDate | null
  reminder: { at: Instant; state: 'PENDING' | 'FIRED' } | null
  recurrence: Recurrence | null
  /** The occurrences of one repeating task share it. */
  seriesId: string | null
  source: TaskSource | null
  createdAt: Instant
  completedAt: Instant | null
  /** Tasks, appointments and notes of the same conversation; null when the API does not tell. */
  related: RelatedItem[] | null
}

/** What `POST /api/tasks/{id}/complete` answers: the task, and the next occurrence of a repeating one (D-84). */
export interface CompletedTask {
  task: TaskItem
  next: TaskItem | null
}
