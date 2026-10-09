// The days, positions and Vietnamese text of the Lịch screen, in the browser's time zone unless one is given (D-89).
import type { LocalDate } from '@/shared/domain'
import { recurrenceLabel } from '@/features/tasks/format'
import type { TaskSource } from '@/features/tasks/tasks.types'
import { formatClock, formatDayMonth, formatIn, localParts, WEEKDAY_NAMES, WEEKDAY_SHORT, weekdayName } from '@/shared/time/local'
import { addDays, addMonths, dayMonthOfDate, daysBetweenDates, localDateOf, weekdayOfDate } from '@/shared/time/localDate'
import type { CalendarData, CalendarEvent, CalendarRange, CalendarReminder, CalendarTask } from './calendar.types'

export type CalendarView = 'week' | 'month' | 'agenda'

/** The height of an hour on the week grid (canvas `.wk { --hr: 46px }`). */
export const HOUR_PX = 46
const DAY_MINUTES = 1440
// Days the agenda asks for at a time.
const AGENDA_DAYS = 14

/** The Monday of the week of a day (D-89). */
export function weekStart(day: LocalDate): LocalDate {
  return addDays(day, -((weekdayOfDate(day) + 6) % 7))
}

const firstOfMonth = (day: LocalDate) => `${day.slice(0, 8)}01`

/** The days a view asks for around its day: the week, the weeks that meet the month, or two weeks of the agenda. */
export function rangeOf(view: CalendarView, anchor: LocalDate): CalendarRange {
  if (view === 'week') {
    const from = weekStart(anchor)
    return { from, to: addDays(from, 7) }
  }
  if (view === 'month') {
    const first = firstOfMonth(anchor)
    const last = addDays(addMonths(first, 1), -1)
    return { from: weekStart(first), to: addDays(weekStart(last), 7) }
  }
  return { from: anchor, to: addDays(anchor, AGENDA_DAYS) }
}

/** The day of the range before or after: a week, a month, or a week of the agenda. */
export function shiftAnchor(view: CalendarView, anchor: LocalDate, step: -1 | 1): LocalDate {
  return view === 'month' ? addMonths(anchor, step) : addDays(anchor, 7 * step)
}

/** The ISO 8601 week of a day: the week that holds its Thursday, in the Thursday's year. */
function isoWeek(day: LocalDate): { week: number; year: number } {
  const thursday = addDays(weekStart(day), 3)
  const year = Number(thursday.slice(0, 4))
  return { week: Math.floor(daysBetweenDates(`${year}-01-01`, thursday) / 7) + 1, year }
}

/** The small line and the title over the calendar (canvas `Calendar`, `heads`). */
export function calendarHead(view: CalendarView, anchor: LocalDate, today: LocalDate): { kicker: string; title: string } {
  if (view === 'week') {
    const from = weekStart(anchor)
    const { week, year } = isoWeek(from)
    return { kicker: `TUẦN ${week} · ${year}`, title: `${dayMonthOfDate(from)} – ${dayMonthOfDate(addDays(from, 6))}` }
  }
  if (view === 'month') {
    const month = Number(anchor.slice(5, 7))
    return { kicker: `THÁNG ${month} · ${anchor.slice(0, 4)}`, title: `Tháng ${month}` }
  }
  return { kicker: anchor === today ? `TỪ HÔM NAY · ${dayMonthOfDate(anchor)}` : `TỪ ${dayMonthOfDate(anchor)}`, title: 'Lịch trình' }
}

function daysOf({ from, to }: CalendarRange): LocalDate[] {
  return Array.from({ length: daysBetweenDates(from, to) }, (_, index) => addDays(from, index))
}

export interface WeekDay {
  date: LocalDate
  /** "T2" */
  label: string
  /** "28" */
  num: string
  past: boolean
  today: boolean
}

export function weekDays(range: CalendarRange, today: LocalDate): WeekDay[] {
  return daysOf(range).map((date) => ({
    date,
    label: WEEKDAY_SHORT[weekdayOfDate(date)],
    num: date.slice(8, 10),
    past: date < today,
    today: date === today,
  }))
}

// Minutes from the start of `day` to an instant, in the time zone: negative before the day, past 1440 after it.
function minutesInto(day: LocalDate, at: string, timeZone?: string): number {
  const date = new Date(at)
  const { hour, minute } = localParts(date, timeZone)
  return daysBetweenDates(day, localDateOf(date, timeZone)) * DAY_MINUTES + hour * 60 + minute
}

/** Where an instant sits on the column of a day, from the top of the grid (00:00). */
export function minuteTop(at: string, day: LocalDate, timeZone?: string): number {
  return (minutesInto(day, at, timeZone) * HOUR_PX) / 60
}

export interface PlacedEvent {
  event: CalendarEvent
  top: number
  height: number
  /** Appointments that meet share the width: this one is `column` of `columns`. */
  column: number
  columns: number
}

/** The timed appointments of a day as blocks, cut at the ends of the day, side by side where they meet (D-88). */
export function placeTimedEvents(events: CalendarEvent[], day: LocalDate, timeZone?: string): PlacedEvent[] {
  const spans = events
    .map((event) => ({
      event,
      start: Math.max(0, minutesInto(day, event.startsAt!, timeZone)),
      end: Math.min(DAY_MINUTES, minutesInto(day, event.endsAt!, timeZone)),
    }))
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const placed: PlacedEvent[] = []
  let group: PlacedEvent[] = []
  let columnEnds: number[] = []
  let groupEnd = -1
  const closeGroup = () => group.forEach((item) => (item.columns = columnEnds.length))
  for (const span of spans) {
    if (span.start >= groupEnd) {
      closeGroup()
      group = []
      columnEnds = []
    }
    const free = columnEnds.findIndex((end) => end <= span.start)
    const column = free === -1 ? columnEnds.length : free
    columnEnds[column] = span.end
    groupEnd = Math.max(groupEnd, span.end)
    const item = { event: span.event, top: (span.start * HOUR_PX) / 60, height: ((span.end - span.start) * HOUR_PX) / 60, column, columns: 1 }
    group.push(item)
    placed.push(item)
  }
  closeGroup()
  return placed
}

const isWholeDayOn = (event: CalendarEvent, day: LocalDate) =>
  event.startDate !== null && event.endDate !== null && event.startDate <= day && day < event.endDate

function touchesDay(event: CalendarEvent, day: LocalDate, timeZone?: string): boolean {
  return event.startsAt !== null && event.endsAt !== null && minutesInto(day, event.startsAt, timeZone) < DAY_MINUTES && minutesInto(day, event.endsAt, timeZone) > 0
}

/** One day of the week: the whole-day row, the appointment blocks, the task chips and the reminder marks. */
export function itemsOfDay(
  data: CalendarData,
  day: LocalDate,
  timeZone?: string,
): { allDay: (CalendarEvent | CalendarTask)[]; timed: CalendarEvent[]; chips: CalendarTask[]; reminders: CalendarReminder[] } {
  return {
    allDay: [...data.events.filter((event) => isWholeDayOn(event, day)), ...data.tasks.filter((task) => task.dueDate === day)],
    timed: data.events.filter((event) => touchesDay(event, day, timeZone)),
    chips: data.tasks.filter((task) => task.dueAt !== null && localDateOf(new Date(task.dueAt), timeZone) === day),
    reminders: data.reminders.filter((reminder) => localDateOf(new Date(reminder.at), timeZone) === day),
  }
}

export interface MonthCell {
  date: LocalDate
  /** "28/9" at the first cell and at the 1st of another month, the day otherwise. */
  num: string
  out: boolean
  today: boolean
}

export function monthCells(range: CalendarRange, anchor: LocalDate, today: LocalDate): MonthCell[] {
  const month = anchor.slice(0, 7)
  return daysOf(range).map((date, index) => {
    const out = date.slice(0, 7) !== month
    const day = Number(date.slice(8, 10))
    return {
      date,
      num: index === 0 || (out && day === 1) ? `${day}/${Number(date.slice(5, 7))}` : String(day),
      out,
      today: date === today,
    }
  })
}

type ItemKind = 'event' | 'task' | 'reminder'

/** The mark before an item (canvas `.mo-item`, `.ag-item`): `source` is the icon of the provider it came from. */
export type ItemIcon = 'done' | 'reminder' | 'source' | 'repeat' | 'task' | 'event'

// Canvas order: a done task, a reminder, then where it came from, then whether it repeats, then what it is.
function iconOf(item: { kind: ItemKind; done: boolean; source: TaskSource | null; recurrence: unknown }): { icon: ItemIcon; provider: string | null } {
  if (item.done) {
    return { icon: 'done', provider: null }
  }
  if (item.kind === 'reminder') {
    return { icon: 'reminder', provider: null }
  }
  if (item.source) {
    return { icon: 'source', provider: item.source.provider }
  }
  if (item.recurrence) {
    return { icon: 'repeat', provider: null }
  }
  return { icon: item.kind === 'task' ? 'task' : 'event', provider: null }
}

// The lists below are built appointments, then tasks, then reminders, and sorting keeps that order at one time (the sort
// of JavaScript is stable): at 09:00 the appointment, the task, then the reminder.
const byTime = (a: { at: string }, b: { at: string }) => Date.parse(a.at) - Date.parse(b.at)

/** Whether an open task's due has passed (a due day once the day has ended). */
function isLate(task: CalendarTask, now: Date, timeZone?: string): boolean {
  if (task.status !== 'OPEN') {
    return false
  }
  return task.dueAt ? Date.parse(task.dueAt) < now.getTime() : task.dueDate !== null && task.dueDate < localDateOf(now, timeZone)
}

const taskLink = (taskId: string) => `/tasks/${taskId}`

export interface MonthItem {
  kind: ItemKind
  id: string
  icon: ItemIcon
  provider: string | null
  /** "10:00 Họp thiết kế"; a whole-day item without the time. */
  text: string
  tone: 'over' | 'done' | null
  to: string
}

/** The items of a month cell: whole-day first, then by time (appointment, task, reminder at the same time). */
export function monthItems(data: CalendarData, day: LocalDate, now: Date, timeZone?: string): MonthItem[] {
  const { allDay, timed, chips, reminders } = itemsOfDay(data, day, timeZone)
  const clock = (at: string) => formatClock(new Date(at), timeZone)
  const taskItem = (task: CalendarTask, text: string): MonthItem => ({
    kind: 'task',
    id: task.id,
    ...iconOf({ kind: 'task', done: task.status === 'DONE', source: task.source, recurrence: task.recurrence }),
    text,
    tone: task.status === 'DONE' ? 'done' : isLate(task, now, timeZone) ? 'over' : null,
    to: taskLink(task.taskId),
  })
  const whole = allDay.map((item) =>
    'eventId' in item
      ? { kind: 'event' as const, id: item.id, ...iconOf({ kind: 'event', done: false, source: item.source, recurrence: item.recurrence }), text: item.title, tone: null, to: `/calendar/${item.id}` }
      : taskItem(item, item.title),
  )
  const timedItems = [
    ...timed.map((event) => ({
      at: event.startsAt!,
      item: {
        kind: 'event' as const,
        id: event.id,
        ...iconOf({ kind: 'event', done: false, source: event.source, recurrence: event.recurrence }),
        text: `${clock(event.startsAt!)} ${event.title}`,
        tone: null,
        to: `/calendar/${event.id}`,
      },
    })),
    ...chips.map((task) => ({ at: task.dueAt!, item: taskItem(task, `${clock(task.dueAt!)} ${task.title}`) })),
    ...reminders.map((reminder) => ({
      at: reminder.at,
      item: {
        kind: 'reminder' as const,
        id: reminder.id,
        ...iconOf({ kind: 'reminder', done: false, source: reminder.source, recurrence: null }),
        text: `${clock(reminder.at)} ${reminder.taskTitle}`,
        tone: null,
        to: taskLink(reminder.taskId),
      },
    })),
  ].sort(byTime)
  return [...whole, ...timedItems.map((entry) => entry.item)]
}

/** "Nhắc: Trả lời “Ảnh chuyến đi Đà Lạt”" for a reply task, "Nhắc: Mua bánh…" otherwise (canvas, Lịch trình). */
export function reminderTitle(taskTitle: string): string {
  const reply = /^Trả lời:\s*(.+)$/.exec(taskTitle)
  return reply ? `Nhắc: Trả lời “${reply[1]}”` : `Nhắc: ${taskTitle}`
}

export interface AgendaItem {
  kind: ItemKind
  id: string
  icon: ItemIcon
  provider: string | null
  /** "16:00 – 17:00", "07:45", "Hạn 30/09", "cả ngày". */
  time: string
  title: string
  source: TaskSource | null
  /** On the right: late, done, fired, "sau 2 giờ", the place, the repeat rule, "nhắc 07:30". */
  note: { text: string; tone: 'err' | null } | null
  over: boolean
  done: boolean
  to: string
}

export interface AgendaDay {
  date: LocalDate
  /** "Hôm nay", "Ngày mai", "Thứ Hai" */
  label: string
  /** "THỨ SÁU 02/10" */
  spec: string
  items: AgendaItem[]
}

/** The agenda from the first day of the range: by day, empty days left out; the tasks late from before open today. */
export function agendaDays(data: CalendarData, now: Date, timeZone?: string): AgendaDay[] {
  const today = localDateOf(now, timeZone)
  const clock = (at: string) => formatClock(new Date(at), timeZone)
  const dueDay = (task: CalendarTask) => task.dueDate ?? localDateOf(new Date(task.dueAt!), timeZone)

  const taskItem = (task: CalendarTask): AgendaItem => {
    const over = isLate(task, now, timeZone)
    const daysLate = over ? daysBetweenDates(dueDay(task), today) : 0
    const rule = recurrenceLabel(task.recurrence)
    return {
      kind: 'task',
      id: task.id,
      ...iconOf({ kind: 'task', done: task.status === 'DONE', source: task.source, recurrence: task.recurrence }),
      time: over && daysLate >= 1 ? `Hạn ${dayMonthOfDate(dueDay(task))}` : task.dueAt ? clock(task.dueAt) : 'cả ngày',
      title: task.title,
      source: task.source,
      note: over
        ? { text: daysLate >= 1 ? `Quá hạn ${daysLate} ngày` : 'Quá hạn', tone: 'err' }
        : task.status === 'DONE'
          ? { text: 'Đã xong', tone: null }
          : rule
            ? { text: rule, tone: null }
            : null,
      over,
      done: task.status === 'DONE',
      to: taskLink(task.taskId),
    }
  }

  const eventItem = (event: CalendarEvent): AgendaItem => {
    const timed = event.startsAt !== null && event.endsAt !== null
    const upcomingToday = timed && Date.parse(event.startsAt!) > now.getTime() && localDateOf(new Date(event.startsAt!), timeZone) === today
    const rule = recurrenceLabel(event.recurrence)
    const note = upcomingToday
      ? formatIn(new Date(event.startsAt!), now)
      : (rule ?? event.location ?? (event.reminder ? `nhắc ${clock(event.reminder.at)}` : null))
    return {
      kind: 'event',
      id: event.id,
      ...iconOf({ kind: 'event', done: false, source: event.source, recurrence: event.recurrence }),
      time: timed ? `${clock(event.startsAt!)} – ${clock(event.endsAt!)}` : 'cả ngày',
      title: event.title,
      source: event.source,
      note: note ? { text: note, tone: null } : null,
      over: false,
      done: false,
      to: `/calendar/${event.id}`,
    }
  }

  const reminderItem = (reminder: CalendarReminder): AgendaItem => ({
    kind: 'reminder',
    id: reminder.id,
    ...iconOf({ kind: 'reminder', done: false, source: reminder.source, recurrence: null }),
    time: clock(reminder.at),
    title: reminderTitle(reminder.taskTitle),
    source: reminder.source,
    note: reminder.state === 'FIRED' ? { text: 'Đã báo', tone: null } : null,
    over: false,
    done: false,
    to: taskLink(reminder.taskId),
  })

  return daysOf(data)
    .map((date) => {
      const lateFromBefore =
        date === today ? data.tasks.filter((task) => isLate(task, now, timeZone) && dueDay(task) < data.from).sort((a, b) => (dueDay(a) < dueDay(b) ? -1 : 1)) : []
      const whole = [...data.events.filter((event) => isWholeDayOn(event, date)).map(eventItem), ...data.tasks.filter((task) => task.dueDate === date).map(taskItem)]
      const timed = [
        ...data.events.filter((event) => event.startsAt && localDateOf(new Date(event.startsAt), timeZone) === date).map((event) => ({ at: event.startsAt!, item: eventItem(event) })),
        ...data.tasks.filter((task) => task.dueAt && localDateOf(new Date(task.dueAt), timeZone) === date).map((task) => ({ at: task.dueAt!, item: taskItem(task) })),
        ...data.reminders.filter((reminder) => localDateOf(new Date(reminder.at), timeZone) === date).map((reminder) => ({ at: reminder.at, item: reminderItem(reminder) })),
      ].sort(byTime)
      const weekday = WEEKDAY_NAMES[weekdayOfDate(date)]
      return {
        date,
        label: date === today ? 'Hôm nay' : date === addDays(today, 1) ? 'Ngày mai' : weekday,
        spec: `${weekday.toUpperCase()} ${dayMonthOfDate(date)}`,
        items: [...lateFromBefore.map(taskItem), ...whole, ...timed.map((entry) => entry.item)],
      }
    })
    .filter((day) => day.items.length > 0)
}

/** "Lịch hẹn", or "Lịch hẹn lặp lại" for an occurrence of a repeating one. */
export function eventKindLabel(event: CalendarEvent): string {
  return event.recurrence ? 'Lịch hẹn lặp lại' : 'Lịch hẹn'
}

const longDay = (date: LocalDate) => `${WEEKDAY_NAMES[weekdayOfDate(date)]} ${dayMonthOfDate(date)}`

/** "Thứ Bảy 03/10 · 18:30 – 21:00", "Hôm nay, Thứ Sáu 02/10 · 16:00 – 17:00", "Thứ Năm 01/10 · cả ngày". */
export function eventWhen(event: CalendarEvent, now: Date, timeZone?: string): string {
  if (event.startsAt && event.endsAt) {
    const start = new Date(event.startsAt)
    const end = new Date(event.endsAt)
    const day = `${weekdayName(start, timeZone)} ${formatDayMonth(start, timeZone)}`
    const prefix = localDateOf(start, timeZone) === localDateOf(now, timeZone) ? 'Hôm nay, ' : ''
    const sameDay = localDateOf(start, timeZone) === localDateOf(end, timeZone)
    const endText = sameDay ? formatClock(end, timeZone) : `${weekdayName(end, timeZone)} ${formatDayMonth(end, timeZone)} ${formatClock(end, timeZone)}`
    return `${prefix}${day} · ${formatClock(start, timeZone)} – ${endText}`
  }
  const first = event.startDate!
  const last = addDays(event.endDate!, -1)
  return first === last ? `${longDay(first)} · cả ngày` : `${longDay(first)} – ${longDay(last)} · cả ngày`
}

/** "1 giờ", "15 phút", "1 giờ 30 phút", "1 ngày". */
function before(minutes: number): string {
  if (minutes >= DAY_MINUTES && minutes % DAY_MINUTES === 0) {
    return `${minutes / DAY_MINUTES} ngày`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours > 0 ? `${hours} giờ` : null, rest > 0 ? `${rest} phút` : null].filter(Boolean).join(' ')
}

/** "17:30 · 1 giờ trước", or "Không". */
export function eventReminder(event: CalendarEvent, timeZone?: string): string {
  return event.reminder ? `${formatClock(new Date(event.reminder.at), timeZone)} · ${before(event.reminder.offsetMinutes)} trước` : 'Không'
}

/** The time zone of the legend: "Giờ Việt Nam · GMT+7"; another zone by its name. */
export function timeZoneLabel(now: Date, timeZone?: string): string {
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value
  const name = zone === 'Asia/Ho_Chi_Minh' || zone === 'Asia/Saigon' ? 'Việt Nam' : zone
  return `Giờ ${name} · ${offset}`
}
