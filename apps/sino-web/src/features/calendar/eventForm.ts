import {
  MAX_COUNT,
  MAX_INTERVAL,
  WEEKDAYS,
  type CustomRule,
  type RepeatChoice,
  type TaskFormField,
} from '@/features/tasks/taskForm'
import type { Recurrence, Weekday } from '@/features/tasks/tasks.types'
import { ApiError } from '@/shared/api/problem'
import type { LocalDate } from '@/shared/domain'
import { formatClock } from '@/shared/time/local'
import { addDays, daysBetweenDates, localDateOf, weekdayOfDate } from '@/shared/time/localDate'
import type { EventBody, StoredEvent } from './calendar.types'

/*
 * The values of the appointment form (FE-73, D-158) and what it sends to `POST /api/events` and `PUT /api/events/{id}`
 * (D-151, D-153). Times are read and written in the browser's time zone, as the rest of the Lịch screen shows them.
 */

export type EventFormField = TaskFormField | 'location'
export type EventFormErrors = Partial<Record<EventFormField, string>>

export interface EventFormValues {
  title: string
  date: LocalDate | ''
  allDay: boolean
  startTime: string
  endTime: string
  /** Days between the start day and the end day (0 for a timed appointment on one day, at least 1 for whole days). */
  daySpan: number
  location: string
  notes: string
  repeat: RepeatChoice
  custom: CustomRule
  /** The day of the month the stored rule began on, kept while the date still fits it. */
  monthDay: number | null
}

const MONDAY_FIRST: Weekday[] = [...WEEKDAYS.slice(1), WEEKDAYS[0]]
const DEFAULT_COUNT = 10
const MAX_DAYS = 14
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

const weekdayOf = (date: LocalDate | '') => (date ? [WEEKDAYS[weekdayOfDate(date)]] : [])

/** A blank form for `/calendar/new`, starting on `date` at 09:00 – 10:00. */
export function emptyEventForm(date: LocalDate): EventFormValues {
  return {
    title: '',
    date,
    allDay: false,
    startTime: '09:00',
    endTime: '10:00',
    daySpan: 0,
    location: '',
    notes: '',
    repeat: 'NONE',
    custom: {
      freq: 'WEEKLY',
      interval: 1,
      byWeekdays: weekdayOf(date),
      end: 'NEVER',
      untilDate: '',
      count: DEFAULT_COUNT,
    },
    monthDay: null,
  }
}

/** The form filled from a stored appointment (`GET /api/events/{id}`). */
export function formOfEvent(
  event: Pick<StoredEvent, 'title' | 'startsAt' | 'endsAt' | 'startDate' | 'endDate' | 'location' | 'notes' | 'recurrence'>,
): EventFormValues {
  const timed = Boolean(event.startsAt && event.endsAt)
  const start = timed ? new Date(event.startsAt!) : null
  const end = timed ? new Date(event.endsAt!) : null
  const date = start ? localDateOf(start) : (event.startDate ?? '')
  const daySpan =
    start && end
      ? Math.max(0, daysBetweenDates(date, localDateOf(end)))
      : event.startDate && event.endDate
        ? Math.max(1, daysBetweenDates(event.startDate, event.endDate))
        : 1
  const rule = event.recurrence
  return {
    title: event.title,
    date,
    allDay: !timed,
    startTime: start ? formatClock(start) : '09:00',
    endTime: end ? formatClock(end) : '10:00',
    daySpan: timed ? daySpan : Math.max(1, daySpan),
    location: event.location ?? '',
    notes: event.notes ?? '',
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

/** Builds the body of `POST /api/events` or `PUT /api/events/{id}` from valid form values. */
export function bodyOfEvent(values: EventFormValues): EventBody {
  const { date, allDay, startTime, endTime, daySpan } = values
  const location = values.location.trim() || null
  const notes = values.notes.trim() || null
  const recurrence = date ? ruleOf(values, date) : null
  if (allDay) {
    return {
      title: values.title.trim(),
      startsAt: null,
      endsAt: null,
      startDate: date || null,
      endDate: date ? addDays(date, Math.max(1, daySpan)) : null,
      location,
      notes,
      recurrence,
    }
  }
  const endDay = date && daySpan > 0 ? addDays(date, daySpan) : date
  return {
    title: values.title.trim(),
    startsAt: date ? new Date(`${date}T${startTime}:00`).toISOString() : null,
    endsAt: endDay ? new Date(`${endDay}T${endTime}:00`).toISOString() : null,
    startDate: null,
    endDate: null,
    location,
    notes,
    recurrence,
  }
}

function ruleOf({ repeat, custom, monthDay }: EventFormValues, date: LocalDate): Recurrence | null {
  if (repeat === 'NONE') {
    return null
  }
  const freq = repeat === 'CUSTOM' ? custom.freq : repeat
  const byWeekdays = repeat === 'CUSTOM' ? MONDAY_FIRST.filter((day) => custom.byWeekdays.includes(day)) : weekdayOf(date)
  return {
    freq,
    interval: repeat === 'CUSTOM' ? custom.interval : 1,
    byWeekdays: freq === 'WEEKLY' ? byWeekdays : null,
    byMonthDay: (freq === 'MONTHLY' || freq === 'YEARLY') && monthDay !== null && fitsMonthDay(date, monthDay) ? monthDay : null,
    untilDate: repeat === 'CUSTOM' && custom.end === 'UNTIL' ? custom.untilDate || null : null,
    count: repeat === 'CUSTOM' && custom.end === 'COUNT' ? custom.count : null,
  }
}

function fitsMonthDay(date: LocalDate, monthDay: number): boolean {
  const [year, month, day] = date.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return monthDay === day || (monthDay > day && day === last)
}

const between = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max

/** Checks the form before sending; the server checks every constraint again. */
export function validateEvent(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {}
  if (!values.title.trim()) {
    errors.title = 'Tiêu đề không được để trống.'
  }
  if (!values.date) {
    errors.date = 'Chọn ngày cho lịch hẹn.'
    return errors
  }
  if (!values.allDay) {
    if (!CLOCK.test(values.startTime) || !CLOCK.test(values.endTime)) {
      errors.time = 'Nhập giờ theo dạng 14:30.'
    } else if (values.daySpan === 0 && values.endTime <= values.startTime) {
      errors.time = 'Giờ kết thúc phải sau giờ bắt đầu.'
    } else if (values.daySpan > MAX_DAYS) {
      errors.time = `Lịch hẹn kéo dài tối đa ${MAX_DAYS} ngày.`
    }
  } else if (values.daySpan > MAX_DAYS) {
    errors.time = `Lịch hẹn kéo dài tối đa ${MAX_DAYS} ngày.`
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
      errors.end = 'Ngày kết thúc không được trước ngày bắt đầu.'
    }
  }
  if (custom.end === 'COUNT' && !between(custom.count, 1, MAX_COUNT)) {
    errors.end = `Nhập một số từ 1 đến ${MAX_COUNT}.`
  }
  return errors
}

const FAILED: EventFormErrors = { form: 'Không lưu được lịch hẹn. Hãy thử lại.' }

const FIELDS: [prefix: string, field: EventFormField, message: string][] = [
  ['title', 'title', 'Tiêu đề không hợp lệ.'],
  ['location', 'location', 'Địa điểm không hợp lệ.'],
  ['notes', 'notes', 'Ghi chú không hợp lệ.'],
  ['endAfterStart', 'time', 'Giờ kết thúc phải sau giờ bắt đầu.'],
  ['oneKindOfTime', 'time', 'Thời gian không hợp lệ.'],
  ['shortEnough', 'time', 'Lịch hẹn kéo dài tối đa 14 ngày.'],
  ['startsAt', 'time', 'Thời gian không hợp lệ.'],
  ['endsAt', 'time', 'Thời gian không hợp lệ.'],
  ['startDate', 'date', 'Ngày không hợp lệ.'],
  ['endDate', 'date', 'Ngày không hợp lệ.'],
  ['withinSupportedYears', 'date', 'Ngày phải trong khoảng năm 1900 đến 2200.'],
  ['recurrence', 'repeat', 'Lặp lại không hợp lệ.'],
]

/** Maps a server error from `POST` or `PUT /api/events` to the field it belongs to. */
export function errorsOfEvent(error: unknown): EventFormErrors {
  if (!(error instanceof ApiError)) {
    return FAILED
  }
  if (error.status === 422 && error.code === 'INVALID_RECURRENCE') {
    return { repeat: 'Lặp lại không khớp với ngày bắt đầu.' }
  }
  if (error.status !== 400 || error.errors.length === 0) {
    return FAILED
  }
  const errors: EventFormErrors = {}
  for (const { field } of error.errors) {
    const known = FIELDS.find(([prefix]) => field.startsWith(prefix))
    if (!known) {
      return FAILED
    }
    errors[known[1]] = known[2]
  }
  return errors
}
