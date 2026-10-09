// Turns the raw tasks (instants, days, repeat rules) into the Vietnamese text of the Việc cần làm screen (D-84: in the
// browser's time zone unless one is given).
import type { LocalDate } from '@/shared/domain'
import { calendarDaysBetween, formatClock, formatDayMonth, WEEKDAY_NAMES, WEEKDAY_SHORT, weekdayName, weekdayShort } from '@/shared/time/local'
import { dayMonthOfDate, daysBetweenDates, localDateOf, weekdayOfDate } from '@/shared/time/localDate'
import type { Recurrence, TaskItem, Weekday } from './tasks.types'

export type TaskFilter = 'all' | 'messages' | 'repeat'
export type TaskGroupKey = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NO_DUE' | 'DONE'

export interface TaskGroup {
  key: TaskGroupKey
  label: string
  tasks: TaskItem[]
}

const GROUP_ORDER: TaskGroupKey[] = ['OVERDUE', 'TODAY', 'UPCOMING', 'NO_DUE', 'DONE']
const WEEKDAY_INDEX: Record<Weekday, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 }

/** The day the task is due in the time zone, or null without a due. */
function dueDay(task: TaskItem, timeZone?: string): LocalDate | null {
  return task.dueDate ?? (task.dueAt ? localDateOf(new Date(task.dueAt), timeZone) : null)
}

/** A due time that has passed, or a due day that has ended; the callers ask it of open tasks only. */
function isOverdue(task: TaskItem, now: Date, timeZone?: string): boolean {
  if (task.dueAt) {
    return Date.parse(task.dueAt) < now.getTime()
  }
  return task.dueDate !== null && task.dueDate < localDateOf(now, timeZone)
}

function groupOf(task: TaskItem, now: Date, timeZone?: string): TaskGroupKey {
  if (task.status === 'DONE') {
    return 'DONE'
  }
  const day = dueDay(task, timeZone)
  if (day === null) {
    return 'NO_DUE'
  }
  if (isOverdue(task, now, timeZone)) {
    return 'OVERDUE'
  }
  return day === localDateOf(now, timeZone) ? 'TODAY' : 'UPCOMING'
}

// By due day; on one day the timed tasks by time, then the whole-day ones (canvas: "17:00" before "Hôm nay").
function byDue(timeZone?: string) {
  const key = (task: TaskItem) => `${dueDay(task, timeZone)}|${task.dueAt ? `0${task.dueAt}` : '1'}`
  return (a: TaskItem, b: TaskItem) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)
}

const newestFirst = (field: 'createdAt' | 'completedAt') => (a: TaskItem, b: TaskItem) => Date.parse(b[field] ?? '') - Date.parse(a[field] ?? '')

/** The groups of the screen in their order; an empty group is left out. */
export function groupTasks(tasks: TaskItem[], now: Date, timeZone?: string): TaskGroup[] {
  const label: Record<TaskGroupKey, string> = {
    OVERDUE: 'QUÁ HẠN',
    TODAY: `HÔM NAY · ${weekdayName(now, timeZone).toUpperCase()} ${formatDayMonth(now, timeZone)}`,
    UPCOMING: 'SẮP TỚI',
    NO_DUE: 'KHÔNG CÓ HẠN',
    DONE: 'ĐÃ XONG',
  }
  const order: Record<TaskGroupKey, (a: TaskItem, b: TaskItem) => number> = {
    OVERDUE: byDue(timeZone),
    TODAY: byDue(timeZone),
    UPCOMING: byDue(timeZone),
    NO_DUE: newestFirst('createdAt'),
    DONE: newestFirst('completedAt'),
  }
  return GROUP_ORDER.map((key) => ({
    key,
    label: label[key],
    tasks: tasks.filter((task) => groupOf(task, now, timeZone) === key).sort(order[key]),
  })).filter((group) => group.tasks.length > 0)
}

/** "T5 15/10" */
function shortDate(date: LocalDate): string {
  return `${WEEKDAY_SHORT[weekdayOfDate(date)]} ${dayMonthOfDate(date)}`
}

/** "T7 03/10" */
function shortDay(date: Date, timeZone?: string): string {
  return `${weekdayShort(date, timeZone)} ${formatDayMonth(date, timeZone)}`
}

/** "Hạn 30/09 · trễ 2 ngày", "Hạn 09:00 · trễ 5 giờ", "Hôm nay · 17:00", "Hôm nay", "T7 03/10 · 17:00", "T5 15/10 · cả ngày". */
export function dueLabel(task: TaskItem, now: Date, timeZone?: string): string | null {
  const today = localDateOf(now, timeZone)
  if (task.dueDate) {
    if (isOverdue(task, now, timeZone)) {
      return `Hạn ${dayMonthOfDate(task.dueDate)} · trễ ${daysBetweenDates(task.dueDate, today)} ngày`
    }
    return task.dueDate === today ? 'Hôm nay' : `${shortDate(task.dueDate)} · cả ngày`
  }
  if (!task.dueAt) {
    return null
  }
  const due = new Date(task.dueAt)
  const clock = formatClock(due, timeZone)
  if (isOverdue(task, now, timeZone)) {
    const days = calendarDaysBetween(due, now, timeZone)
    if (days >= 1) {
      return `Hạn ${formatDayMonth(due, timeZone)} · trễ ${days} ngày`
    }
    const minutes = Math.floor((now.getTime() - due.getTime()) / 60_000)
    return `Hạn ${clock} · trễ ${minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ`}`
  }
  return localDateOf(due, timeZone) === today ? `Hôm nay · ${clock}` : `${shortDay(due, timeZone)} · ${clock}`
}

/** "Đã nhắc 08:12" once it fired, otherwise when it will: "Hôm nay 18:00", "T2 05/10 09:00". */
export function reminderLabel(task: TaskItem, now: Date, timeZone?: string): string | null {
  if (!task.reminder) {
    return null
  }
  const at = new Date(task.reminder.at)
  const today = calendarDaysBetween(at, now, timeZone) === 0
  const clock = formatClock(at, timeZone)
  if (task.reminder.state === 'FIRED') {
    return today ? `Đã nhắc ${clock}` : `Đã nhắc ${shortDay(at, timeZone)} ${clock}`
  }
  return today ? `Hôm nay ${clock}` : `${shortDay(at, timeZone)} ${clock}`
}

/** "thứ Hai" inside a sentence; "Chủ nhật" keeps its capital, as on the canvas ("Mỗi Chủ nhật"). */
function weekdayInSentence(day: Weekday): string {
  const index = WEEKDAY_INDEX[day]
  const name = WEEKDAY_NAMES[index]
  return index === 0 ? name : name.charAt(0).toLowerCase() + name.slice(1)
}

/** "Mỗi thứ Hai", "2 tuần một lần · thứ Hai", "Hằng tháng · ngày 2", "Hằng ngày", "Hằng năm". */
export function recurrenceLabel(rule: Recurrence | null): string | null {
  if (!rule) {
    return null
  }
  const every = (unit: string, each: string) => (rule.interval === 1 ? each : `${rule.interval} ${unit} một lần`)
  switch (rule.freq) {
    case 'DAILY':
      return every('ngày', 'Hằng ngày')
    case 'WEEKLY': {
      const days = (rule.byWeekdays ?? []).map(weekdayInSentence).join(', ')
      if (!days) {
        return every('tuần', 'Hằng tuần')
      }
      return rule.interval === 1 ? `Mỗi ${days}` : `${rule.interval} tuần một lần · ${days}`
    }
    case 'MONTHLY': {
      const base = every('tháng', 'Hằng tháng')
      return rule.byMonthDay ? `${base} · ngày ${rule.byMonthDay}` : base
    }
    case 'YEARLY':
      return every('năm', 'Hằng năm')
  }
}

/** "Xong 07:45 hôm nay", "Xong 20:10 hôm qua", "Xong T2 28/09". */
export function doneLabel(task: TaskItem, now: Date, timeZone?: string): string {
  const at = new Date(task.completedAt ?? now.toISOString())
  const days = calendarDaysBetween(at, now, timeZone)
  const clock = formatClock(at, timeZone)
  if (days <= 0) {
    return `Xong ${clock} hôm nay`
  }
  return days === 1 ? `Xong ${clock} hôm qua` : `Xong ${shortDay(at, timeZone)}`
}

/** For a done task of a series: "Đã tạo lần kế tiếp: T2 05/10", the open occurrence the server made (D-84). */
export function nextOccurrenceLabel(task: TaskItem, tasks: TaskItem[], timeZone?: string): string | null {
  if (task.status !== 'DONE' || task.seriesId === null) {
    return null
  }
  const next = tasks.find((other) => other.seriesId === task.seriesId && other.status === 'OPEN' && other.id !== task.id)
  const day = next?.dueDate ? shortDate(next.dueDate) : next?.dueAt ? shortDay(new Date(next.dueAt), timeZone) : null
  return day ? `Đã tạo lần kế tiếp: ${day}` : null
}

/** One line under a task's title, with the icon the canvas gives it; late lines are red, today's bold. */
export interface TaskMeta {
  icon: 'due' | 'today' | 'reminder' | 'repeat' | 'done'
  text: string
  tone: 'over' | 'today' | null
}

/**
 * The lines of a row, in the canvas order: for an open task its due, reminder and repeat rule; for a done one when it
 * was done and, in a series, the next occurrence (canvas `Tasks`, "ĐÃ XONG"). The source tag follows them.
 */
export function taskMeta(task: TaskItem, tasks: TaskItem[], now: Date, timeZone?: string): TaskMeta[] {
  if (task.status === 'DONE') {
    const next = nextOccurrenceLabel(task, tasks, timeZone)
    return [{ icon: 'done', text: doneLabel(task, now, timeZone), tone: null }, ...(next ? [{ icon: 'repeat' as const, text: next, tone: null }] : [])]
  }
  const lines: TaskMeta[] = []
  const due = dueLabel(task, now, timeZone)
  if (due) {
    const group = groupOf(task, now, timeZone)
    lines.push(
      group === 'OVERDUE'
        ? { icon: 'due', text: due, tone: 'over' }
        : group === 'TODAY'
          ? { icon: 'today', text: due, tone: 'today' }
          : { icon: 'due', text: due, tone: null },
    )
  }
  const reminder = reminderLabel(task, now, timeZone)
  if (reminder) {
    lines.push({ icon: 'reminder', text: reminder, tone: null })
  }
  const rule = recurrenceLabel(task.recurrence)
  if (rule) {
    lines.push({ icon: 'repeat', text: rule, tone: null })
  }
  return lines
}

/** The line under the title: "8 việc đang mở · 1 quá hạn · 5 việc tạo từ tin nhắn", in parts (the late one is red). */
export function tasksHeadline(tasks: TaskItem[], now: Date, timeZone?: string): { open: string; overdue: string | null; fromMessages: string | null } {
  const open = tasks.filter((task) => task.status === 'OPEN')
  const overdue = open.filter((task) => isOverdue(task, now, timeZone)).length
  const fromMessages = open.filter((task) => task.source !== null).length
  return {
    open: open.length > 0 ? `${open.length} việc đang mở` : 'Không có việc nào đang mở',
    overdue: overdue > 0 ? `${overdue} quá hạn` : null,
    fromMessages: fromMessages > 0 ? `${fromMessages} việc tạo từ tin nhắn` : null,
  }
}

/** "8 đang mở", under the mobile title. */
export function openCountLabel(tasks: TaskItem[]): string {
  return `${tasks.filter((task) => task.status === 'OPEN').length} đang mở`
}

/** The numbers of the navigation (D-83): tasks that are due (late or today), and the late ones. */
export function navCountsOf(tasks: TaskItem[], now: Date, timeZone?: string): { tasksDue: number; tasksOverdue: number } {
  const groups = tasks.map((task) => groupOf(task, now, timeZone))
  const overdue = groups.filter((group) => group === 'OVERDUE').length
  return { tasksDue: overdue + groups.filter((group) => group === 'TODAY').length, tasksOverdue: overdue }
}

export function filterTasks(tasks: TaskItem[], filter: TaskFilter): TaskItem[] {
  if (filter === 'messages') {
    return tasks.filter((task) => task.source !== null)
  }
  return filter === 'repeat' ? tasks.filter((task) => task.recurrence !== null) : tasks
}

/** "Thứ Tư 07/10 · 17:00" */
function longDayTime(date: Date, timeZone?: string): string {
  return `${weekdayName(date, timeZone)} ${formatDayMonth(date, timeZone)} · ${formatClock(date, timeZone)}`
}

/** "Thứ Tư 07/10 · 17:00", "Thứ Năm 15/10 · cả ngày", "Không có hạn". */
export function detailDue(task: TaskItem, timeZone?: string): string {
  if (task.dueDate) {
    return `${WEEKDAY_NAMES[weekdayOfDate(task.dueDate)]} ${dayMonthOfDate(task.dueDate)} · cả ngày`
  }
  return task.dueAt ? longDayTime(new Date(task.dueAt), timeZone) : 'Không có hạn'
}

/** "Thứ Hai 05/10 · 09:00", "Đã nhắc · Thứ Sáu 02/10 · 08:12", "Không". */
export function detailReminder(task: TaskItem, timeZone?: string): string {
  if (!task.reminder) {
    return 'Không'
  }
  const when = longDayTime(new Date(task.reminder.at), timeZone)
  return task.reminder.state === 'FIRED' ? `Đã nhắc · ${when}` : when
}

/** "09:52 hôm nay, từ Hộp thư", "21:10 hôm qua", "T2 28/09 10:00". */
export function createdLabel(task: TaskItem, now: Date, timeZone?: string): string {
  const at = new Date(task.createdAt)
  const days = calendarDaysBetween(at, now, timeZone)
  const clock = formatClock(at, timeZone)
  const when = days <= 0 ? `${clock} hôm nay` : days === 1 ? `${clock} hôm qua` : `${shortDay(at, timeZone)} ${clock}`
  return task.source ? `${when}, từ Hộp thư` : when
}
