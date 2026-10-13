import type { LocalDate } from '@/shared/domain'
import { createTasksSample, nextOccurrenceSample } from '@/features/tasks/tasks.sample'
import type { Recurrence, TaskItem, TaskSource } from '@/features/tasks/tasks.types'
import { clockFrom, dayClockFrom } from '@/shared/time/canvasClock'
import { addDays, daysBetweenDates, localDateOf } from '@/shared/time/localDate'
import type { CalendarData, CalendarEvent, CalendarRange, CalendarReminder, CalendarTask } from './calendar.types'

// The canvas is in Vietnam, which keeps +07:00 all year.
const SAMPLE_ZONE = 'Asia/Ho_Chi_Minh'
const MINUTE = 60_000

const base = {
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
} satisfies Partial<CalendarEvent>

const from = (conversationId: string, provider: string, title: string, subject: string | null, preview: string | null): CalendarEvent['source'] => ({
  kind: 'MESSAGE',
  id: `${conversationId}-source`,
  conversationId,
  provider,
  title,
  subject,
  missing: false,
  preview,
})

const remindBefore = (startsAt: string, offsetMinutes: number, now: Date): CalendarEvent['reminder'] => {
  const at = new Date(Date.parse(startsAt) - offsetMinutes * MINUTE).toISOString()
  return { at, offsetMinutes, state: Date.parse(at) <= now.getTime() ? 'FIRED' : 'PENDING' }
}

const sundays: Recurrence = { freq: 'WEEKLY', interval: 1, byWeekdays: ['SUNDAY'], byMonthDay: null, untilDate: null, count: null }

// The appointments of the canvas `Calendar` (one-off), as on Friday 02/10/2026 at 14:05.
function appointments(now: Date): CalendarEvent[] {
  const at = clockFrom(now)
  const day = dayClockFrom(now)
  const timed = (id: string, title: string, start: string, end: string) => ({ ...base, id, eventId: id, title, startsAt: at(start), endsAt: at(end) })
  const minhAnh = from('conv-1', 'gmail', 'Trần Minh Anh', 'Hợp đồng thuê văn phòng — bản sửa lần 2', 'Chào anh An, em gửi lại bản hợp đồng đã sửa theo góp ý hôm qua.')
  const call = timed('event-call', 'Gọi Minh Anh về phụ lục giá', '2026-10-02T16:00:00+07:00', '2026-10-02T17:00:00+07:00')
  const home = timed('event-home', 'Về nhà ăn cơm', '2026-10-03T18:30:00+07:00', '2026-10-03T21:00:00+07:00')
  const checkup = timed('event-checkup', 'Khám sức khỏe', '2026-10-05T08:30:00+07:00', '2026-10-05T09:30:00+07:00')
  const sign = timed('event-sign', 'Ký hợp đồng thuê văn phòng', '2026-10-08T14:00:00+07:00', '2026-10-08T15:00:00+07:00')
  return [
    {
      ...timed('event-design', 'Họp thiết kế với Lê Hoàng', '2026-09-29T10:00:00+07:00', '2026-09-29T11:00:00+07:00'),
      source: from('conv-4', 'messenger', 'Lê Hoàng', null, 'Lê Hoàng: Thứ Ba họp chốt bản thiết kế nhé.'),
    },
    {
      ...base,
      id: 'event-birthday',
      eventId: 'event-birthday',
      title: 'Sinh nhật Hà',
      startDate: day('2026-10-01'),
      endDate: day('2026-10-02'),
      // The canvas marks the pill as repeating: a birthday comes back every year.
      recurrence: { freq: 'YEARLY', interval: 1, byWeekdays: null, byMonthDay: null, untilDate: null, count: null },
    },
    {
      ...call,
      location: 'Gọi điện',
      reminder: remindBefore(call.startsAt, 15, now),
      notes: 'Hỏi lại điều khoản 4: thanh toán trong 10 ngày hay 15 ngày.',
      source: minhAnh,
      related: [{ kind: 'NOTE', id: 'note-clause', title: 'Điều khoản 4 — thời hạn thanh toán', at: null, allDay: false }],
    },
    {
      ...home,
      location: 'Nhà bố mẹ',
      reminder: remindBefore(home.startsAt, 60, now),
      notes: 'Mang thêm trái cây. Bà thích bánh bông lan trứng muối.',
      source: from('conv-2', 'zalo', 'Gia đình', null, 'Mẹ: Cuối tuần này cả nhà về ăn cơm nhé, nhớ mua bánh cho bà.'),
      related: [{ kind: 'TASK', id: 'task-cake', title: 'Mua bánh bông lan trứng muối cho bà', at: at('2026-10-03T17:00:00+07:00'), allDay: false }],
    },
    {
      ...checkup,
      reminder: remindBefore(checkup.startsAt, 60, now),
      source: from('conv-3', 'gmail', 'Phòng khám Ánh Dương', 'Nhắc lịch khám thứ Hai 05/10', null),
    },
    { ...sign, reminder: remindBefore(sign.startsAt, 30, now), source: minhAnh },
  ]
}

// The Sunday run, every week from the canvas Sunday 06/09: each occurrence that meets the range, as the server would make
// it (D-86); only the nearest coming one keeps a reminder ("chỉ lần gần nhất có nhắc nhở đang chờ").
function runs(now: Date, range: CalendarRange): CalendarEvent[] {
  const at = clockFrom(now)
  const first = at('2026-09-06T06:00:00+07:00')
  const firstDay = localDateOf(new Date(first), SAMPLE_ZONE)
  const occurrences: CalendarEvent[] = []
  for (let week = Math.max(0, Math.floor(daysBetweenDates(firstDay, range.from) / 7)); ; week++) {
    const startsAt = new Date(Date.parse(first) + week * 7 * 24 * 60 * MINUTE).toISOString()
    const date = localDateOf(new Date(startsAt), SAMPLE_ZONE)
    if (date >= range.to) {
      break
    }
    if (date >= range.from) {
      occurrences.push({
        ...base,
        id: `event-run@${date}`,
        eventId: 'event-run',
        title: 'Chạy bộ Hồ Tây',
        startsAt,
        endsAt: new Date(Date.parse(startsAt) + 60 * MINUTE).toISOString(),
        location: 'Điểm hẹn cũ, Hồ Tây',
        recurrence: sundays,
        notes: 'Lần lặp được tính khi xem lịch; chỉ lần gần nhất có nhắc nhở đang chờ.',
        source: from('conv-5', 'zalo', 'Nhóm chạy bộ Hồ Tây', null, 'Tuấn: Sáng Chủ nhật 6 giờ, điểm hẹn cũ nhé mọi người.'),
      })
    }
  }
  const nearest = occurrences.find((event) => Date.parse(event.startsAt!) > now.getTime())
  return occurrences.map((event) => (event === nearest ? { ...event, reminder: remindBefore(event.startsAt!, 30, now) } : event))
}

const dueDayOf = (task: Pick<TaskItem, 'dueAt' | 'dueDate'>): LocalDate | null =>
  task.dueDate ?? (task.dueAt ? localDateOf(new Date(task.dueAt), SAMPLE_ZONE) : null)

function toCalendarTask(task: TaskItem, id = task.id): CalendarTask {
  const { title, status, dueAt, dueDate, completedAt, recurrence, source } = task
  return { id, taskId: task.id, title, status, dueAt, dueDate, completedAt, recurrence, source: source as TaskSource | null }
}

/**
 * The tasks of the range from the tasks sample, so both screens show the same tasks: those due in it, the open ones late
 * from before when the range holds today, and the coming occurrences of repeating tasks (canvas month: "Báo cáo tuần"
 * every Monday).
 */
function tasksOf(tasks: TaskItem[], now: Date, range: CalendarRange): { tasks: CalendarTask[]; reminders: CalendarReminder[] } {
  const today = localDateOf(now, SAMPLE_ZONE)
  const holdsToday = range.from <= today && today < range.to
  const inRange = (day: LocalDate | null) => day !== null && range.from <= day && day < range.to
  const calendarTasks: CalendarTask[] = []
  for (const task of tasks) {
    const day = dueDayOf(task)
    const lateFromBefore = holdsToday && task.status === 'OPEN' && day !== null && day < range.from
    if (inRange(day) || lateFromBefore) {
      calendarTasks.push(toCalendarTask(task))
    }
    if (task.status === 'OPEN' && task.recurrence && day !== null) {
      let occurrence: TaskItem | null = task
      while (occurrence) {
        const occurrenceDay = dueDayOf(occurrence)!
        occurrence = nextOccurrenceSample(occurrence, new Date(`${addDays(occurrenceDay, 1)}T00:00:00+07:00`))
        const nextDay = occurrence && dueDayOf(occurrence)
        if (!occurrence || !nextDay || nextDay >= range.to) {
          break
        }
        if (inRange(nextDay)) {
          calendarTasks.push(toCalendarTask({ ...occurrence, id: task.id }, `${task.id}@${nextDay}`))
        }
      }
    }
  }
  const reminders = tasks
    .filter((task) => task.reminder && inRange(localDateOf(new Date(task.reminder.at), SAMPLE_ZONE)))
    .map((task) => ({
      id: `reminder-${task.id}`,
      taskId: task.id,
      taskTitle: task.title,
      at: task.reminder!.at,
      state: task.reminder!.state,
      source: task.source,
    }))
  return { tasks: calendarTasks, reminders }
}

/**
 * Sample data shaped like the "Sino UI" canvas (`Calendar`, `MobileCalendar`) for the range a screen asks for: the
 * appointments of the canvas with every occurrence of the Sunday run, and the tasks and reminders of the tasks sample.
 * Every time moves with `now`; at 14:05 on Friday 02/10/2026 it shows the canvas.
 */
export function createCalendarSample(now: Date, range: CalendarRange): CalendarData {
  const { providers, tasks } = createTasksSample(now)
  const touches = (event: CalendarEvent) => {
    const first = event.startDate ?? localDateOf(new Date(event.startsAt!), SAMPLE_ZONE)
    const last = event.endDate ? addDays(event.endDate, -1) : localDateOf(new Date(event.endsAt!), SAMPLE_ZONE)
    return first < range.to && last >= range.from
  }
  return {
    generatedAt: now.toISOString(),
    ...range,
    providers,
    events: [...appointments(now).filter(touches), ...runs(now, range)],
    ...tasksOf(tasks, now, range),
  }
}
