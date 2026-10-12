import { ApiError } from '@/shared/api/problem'
import type { Instant, LocalDate } from '@/shared/domain'
import { formatClock } from '@/shared/time/local'
import { localDateOf, weekdayOfDate } from '@/shared/time/localDate'
import type { Recurrence, TaskItem, Weekday } from './tasks.types'

/*
 * The values of the task form (FE-71, D-158) and what it sends: the title and the notes through `PATCH`, the due and
 * the repeat rule through `PUT …/schedule` (D-153). Times are read and written in the browser's time zone, as the
 * rest of the screen shows them.
 */

export type RepeatChoice = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM'

/** "Tùy chỉnh…": every N days, weeks, months or years, the weekdays of a weekly rule, and how it ends. */
export interface CustomRule {
  freq: Recurrence['freq']
  interval: number
  byWeekdays: Weekday[]
  end: 'NEVER' | 'UNTIL' | 'COUNT'
  untilDate: LocalDate | ''
  count: number
}

export interface TaskFormValues {
  title: string
  notes: string
  /** Empty: no due. */
  date: LocalDate | ''
  /** "HH:mm", or `ALL_DAY`. */
  time: string
  repeat: RepeatChoice
  custom: CustomRule
  /** The day of the month the stored rule began on, kept while the date still fits it (31 → 30/11). */
  monthDay: number | null
}

/** The body of `PUT /api/tasks/{id}/schedule`. */
export interface TaskSchedule {
  dueAt: Instant | null
  dueDate: LocalDate | null
  recurrence: Recurrence | null
}

export type TaskFormField = 'title' | 'notes' | 'date' | 'time' | 'repeat' | 'interval' | 'weekdays' | 'end' | 'form'
export type TaskFormErrors = Partial<Record<TaskFormField, string>>

/** By weekday number, 0 = Sunday, as `weekdayOfDate`. */
export const WEEKDAYS: Weekday[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const MONDAY_FIRST: Weekday[] = [...WEEKDAYS.slice(1), WEEKDAYS[0]]

export const MAX_INTERVAL = 99
export const MAX_COUNT = 999
const DEFAULT_COUNT = 10
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

const weekdayOf = (date: LocalDate | '') => (date ? [WEEKDAYS[weekdayOfDate(date)]] : [])

/** The form filled from a task. */
export function formOf(task: TaskItem): TaskFormValues {
  const due = task.dueAt ? new Date(task.dueAt) : null
  const date = due ? localDateOf(due) : (task.dueDate ?? '')
  const rule = task.recurrence
  return {
    title: task.title,
    notes: task.notes ?? '',
    date,
    time: due ? formatClock(due) : 'ALL_DAY',
    repeat: rule ? choiceOf(rule, date) : 'NONE',
    custom: {
      freq: rule?.freq ?? 'WEEKLY',
      interval: rule?.interval ?? 1,
      byWeekdays: rule?.byWeekdays ?? weekdayOf(date),
      end: rule?.untilDate ? 'UNTIL' : rule?.count ? 'COUNT' : 'NEVER',
      untilDate: rule?.untilDate ?? '',
      count: rule?.count ?? DEFAULT_COUNT,
    },
    monthDay: rule?.byMonthDay ?? null,
  }
}

// A preset is every 1 with no end; weekly only on the weekday of the due.
function choiceOf(rule: Recurrence, date: LocalDate | ''): RepeatChoice {
  if (rule.interval !== 1 || rule.untilDate || rule.count) {
    return 'CUSTOM'
  }
  if (rule.freq === 'WEEKLY') {
    const days = rule.byWeekdays ?? []
    return days.length === 1 && days[0] === weekdayOf(date)[0] ? 'WEEKLY' : 'CUSTOM'
  }
  return rule.freq
}

/** What "Lưu" puts: no date is no due and no rule, whatever the repeat says. */
export function scheduleOf(values: TaskFormValues): TaskSchedule {
  const { date, time } = values
  if (!date) {
    return { dueAt: null, dueDate: null, recurrence: null }
  }
  return {
    dueAt: time === 'ALL_DAY' ? null : new Date(`${date}T${time}:00`).toISOString(),
    dueDate: time === 'ALL_DAY' ? date : null,
    recurrence: ruleOf(values, date),
  }
}

function ruleOf({ repeat, custom, monthDay }: TaskFormValues, date: LocalDate): Recurrence | null {
  if (repeat === 'NONE') {
    return null
  }
  const freq = repeat === 'CUSTOM' ? custom.freq : repeat
  const byWeekdays = repeat === 'CUSTOM' ? MONDAY_FIRST.filter((day) => custom.byWeekdays.includes(day)) : weekdayOf(date)
  return {
    freq,
    interval: repeat === 'CUSTOM' ? custom.interval : 1,
    byWeekdays: freq === 'WEEKLY' ? byWeekdays : null,
    // Without it the server takes the day of the due.
    byMonthDay: (freq === 'MONTHLY' || freq === 'YEARLY') && monthDay !== null && fitsMonthDay(date, monthDay) ? monthDay : null,
    untilDate: repeat === 'CUSTOM' && custom.end === 'UNTIL' ? custom.untilDate || null : null,
    count: repeat === 'CUSTOM' && custom.end === 'COUNT' ? custom.count : null,
  }
}

// The day itself, or a larger one when the date is the last day of its month.
function fitsMonthDay(date: LocalDate, monthDay: number): boolean {
  const [year, month, day] = date.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return monthDay === day || (monthDay > day && day === last)
}

const between = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max

/** What the form refuses before sending; the server checks it all again. */
export function validate(values: TaskFormValues): TaskFormErrors {
  const errors: TaskFormErrors = {}
  if (!values.title.trim()) {
    errors.title = 'Tiêu đề không được để trống.'
  }
  if (!values.date) {
    return errors
  }
  if (values.time !== 'ALL_DAY' && !CLOCK.test(values.time)) {
    errors.time = 'Nhập giờ theo dạng 14:30.'
  }
  if (values.repeat !== 'CUSTOM') {
    return errors
  }
  const { custom } = values
  if (!between(custom.interval, 1, MAX_INTERVAL)) {
    errors.interval = `Nhập một số từ 1 đến ${MAX_INTERVAL}.`
  }
  if (custom.freq === 'WEEKLY' && custom.byWeekdays.length === 0) {
    errors.weekdays = 'Chọn ít nhất một thứ.'
  }
  if (custom.end === 'UNTIL') {
    if (!custom.untilDate) {
      errors.end = 'Chọn ngày kết thúc.'
    } else if (custom.untilDate < values.date) {
      errors.end = 'Ngày kết thúc không được trước hạn.'
    }
  }
  if (custom.end === 'COUNT' && !between(custom.count, 1, MAX_COUNT)) {
    errors.end = `Nhập một số từ 1 đến ${MAX_COUNT}.`
  }
  return errors
}

const FAILED: TaskFormErrors = { form: 'Không lưu được việc. Hãy thử lại.' }

// The field of a 400 as the backend names it (record components and `@AssertTrue` methods) → the box it belongs to.
const FIELDS: [prefix: string, field: TaskFormField, message: string][] = [
  ['title', 'title', 'Tiêu đề không hợp lệ.'],
  ['notes', 'notes', 'Ghi chú không hợp lệ.'],
  ['due', 'date', 'Hạn không hợp lệ.'],
  ['oneDue', 'date', 'Hạn không hợp lệ.'],
  ['recurrence', 'repeat', 'Lặp lại không hợp lệ.'],
  ['repeating', 'repeat', 'Lặp lại không hợp lệ.'],
]

/** Where a refused save shows: next to the box it is about, or under the form. */
export function errorsOf(error: unknown): TaskFormErrors {
  if (!(error instanceof ApiError)) {
    return FAILED
  }
  if (error.status === 422 && error.code === 'INVALID_RECURRENCE') {
    return { repeat: 'Lặp lại không khớp với ngày hạn.' }
  }
  if (error.status !== 400 || error.errors.length === 0) {
    return FAILED
  }
  const errors: TaskFormErrors = {}
  for (const { field } of error.errors) {
    const known = FIELDS.find(([prefix]) => field.startsWith(prefix))
    if (!known) {
      return FAILED
    }
    errors[known[1]] = known[2]
  }
  return errors
}
