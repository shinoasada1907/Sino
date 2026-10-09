import type { LocalDate } from '@/shared/domain'
import { clockFrom, dayClockFrom } from '@/shared/time/canvasClock'
import { formatClock } from '@/shared/time/local'
import { addDays, localDateOf } from '@/shared/time/localDate'
import type { Recurrence, TaskItem, TaskSource, TasksData } from './tasks.types'

const base = {
  notes: null,
  status: 'OPEN',
  dueAt: null,
  dueDate: null,
  reminder: null,
  recurrence: null,
  seriesId: null,
  source: null,
  completedAt: null,
  related: null,
} satisfies Partial<TaskItem>

const rule = (extra: Partial<Recurrence> & Pick<Recurrence, 'freq'>): Recurrence => ({
  interval: 1,
  byWeekdays: null,
  byMonthDay: null,
  untilDate: null,
  count: null,
  ...extra,
})

const from = (conversationId: string, provider: string, title: string, subject: string | null = null, missing = false): TaskSource => ({
  kind: 'MESSAGE',
  id: `${conversationId}-source`,
  conversationId,
  provider,
  title,
  subject,
  missing,
})

/**
 * Sample data shaped like the "Sino UI" canvas (`Tasks`, `MobileTasks`). The conversations are those of the inbox
 * sample, and `task-contract`, `task-cake` are the tasks the inbox links to. Every time moves with `now`; at 14:05 on
 * Friday 02/10/2026 it shows the canvas.
 */
export function createTasksSample(now: Date): TasksData {
  const at = clockFrom(now)
  const day = dayClockFrom(now)
  const tasks: TaskItem[] = [
    {
      ...base,
      id: 'task-bill',
      title: 'Gửi lại hóa đơn tháng 9 cho kế toán',
      // 17:00, as the canvas Lịch places it; the Tasks canvas only says "Hạn 30/09 · trễ 2 ngày".
      dueAt: at('2026-09-30T17:00:00+07:00'),
      reminder: { at: at('2026-10-02T08:12:00+07:00'), state: 'FIRED' },
      createdAt: at('2026-09-25T10:00:00+07:00'),
    },
    {
      ...base,
      id: 'task-rent',
      title: 'Chuyển tiền nhà tháng 10',
      dueAt: at('2026-10-02T17:00:00+07:00'),
      recurrence: rule({ freq: 'MONTHLY', byMonthDay: 2 }),
      seriesId: 'series-rent',
      createdAt: at('2026-09-02T17:30:00+07:00'),
    },
    {
      ...base,
      id: 'task-photos',
      title: 'Trả lời: Ảnh chuyến đi Đà Lạt',
      dueDate: day('2026-10-02'),
      reminder: { at: at('2026-10-02T09:00:00+07:00'), state: 'FIRED' },
      source: from('conv-6', 'gmail', 'Thu Trang', 'Ảnh chuyến đi Đà Lạt'),
      createdAt: at('2026-10-01T22:15:00+07:00'),
    },
    {
      ...base,
      id: 'task-cake',
      title: 'Mua bánh bông lan trứng muối cho bà',
      dueAt: at('2026-10-03T17:00:00+07:00'),
      reminder: { at: at('2026-10-02T18:00:00+07:00'), state: 'PENDING' },
      source: from('conv-2', 'zalo', 'Gia đình'),
      createdAt: at('2026-10-02T08:21:00+07:00'),
    },
    {
      ...base,
      id: 'task-weekly',
      title: 'Báo cáo tuần',
      dueAt: at('2026-10-05T09:00:00+07:00'),
      recurrence: rule({ freq: 'WEEKLY', byWeekdays: ['MONDAY'] }),
      seriesId: 'series-weekly',
      createdAt: at('2026-09-28T10:30:00+07:00'),
    },
    {
      ...base,
      id: 'task-contract',
      title: 'Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2',
      notes: 'Xem điều khoản 4 và phụ lục giá trước khi trả lời. Minh Anh cần phản hồi trước thứ Tư.',
      dueAt: at('2026-10-07T17:00:00+07:00'),
      reminder: { at: at('2026-10-05T09:00:00+07:00'), state: 'PENDING' },
      source: from('conv-1', 'gmail', 'Trần Minh Anh', 'Hợp đồng thuê văn phòng — bản sửa lần 2'),
      createdAt: at('2026-10-02T09:52:00+07:00'),
      related: [
        { kind: 'NOTE', id: 'note-clause', title: 'Điều khoản 4 — thời hạn thanh toán', at: null, allDay: false },
        { kind: 'EVENT', id: 'event-sign', title: 'Ký hợp đồng', at: at('2026-10-08T14:00:00+07:00'), allDay: false },
      ],
    },
    {
      ...base,
      id: 'task-insurance',
      title: 'Gia hạn bảo hiểm TA-2025-0418',
      dueDate: day('2026-10-15'),
      reminder: { at: at('2026-10-12T09:00:00+07:00'), state: 'PENDING' },
      source: from('conv-insurance', 'gmail', 'Bảo hiểm Tâm An', 'Thông báo gia hạn hợp đồng TA-2025-0418', true),
      createdAt: at('2026-09-30T16:40:00+07:00'),
    },
    {
      ...base,
      id: 'task-print',
      title: 'Hỏi Hoàng giá in bản thiết kế',
      source: from('conv-4', 'messenger', 'Lê Hoàng'),
      createdAt: at('2026-10-01T21:10:00+07:00'),
    },
    {
      ...base,
      id: 'task-clinic',
      title: 'Xác nhận lịch khám với Phòng khám Ánh Dương',
      status: 'DONE',
      dueAt: at('2026-10-02T07:45:00+07:00'),
      source: from('conv-3', 'gmail', 'Phòng khám Ánh Dương', 'Nhắc lịch khám thứ Hai 05/10'),
      createdAt: at('2026-09-30T08:00:00+07:00'),
      completedAt: at('2026-10-02T07:45:00+07:00'),
    },
    {
      ...base,
      id: 'task-weekly-0928',
      title: 'Báo cáo tuần',
      status: 'DONE',
      dueAt: at('2026-09-28T09:00:00+07:00'),
      recurrence: rule({ freq: 'WEEKLY', byWeekdays: ['MONDAY'] }),
      seriesId: 'series-weekly',
      createdAt: at('2026-09-21T10:30:00+07:00'),
      completedAt: at('2026-09-28T10:30:00+07:00'),
    },
  ]
  return {
    generatedAt: now.toISOString(),
    providers: [
      { type: 'gmail', displayName: 'Gmail' },
      { type: 'zalo', displayName: 'Zalo' },
      { type: 'messenger', displayName: 'Messenger' },
    ],
    tasks,
  }
}

// The sample's own clock: the canvas is in Vietnam, which keeps +07:00 all year.
const SAMPLE_ZONE = 'Asia/Ho_Chi_Minh'

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// The day of the occurrence after `day`: months keep the first day of the series, or the last day of a shorter month.
function step(day: LocalDate, rule: Recurrence): LocalDate {
  if (rule.freq === 'DAILY' || rule.freq === 'WEEKLY') {
    return addDays(day, rule.interval * (rule.freq === 'WEEKLY' ? 7 : 1))
  }
  const [year, month, date] = day.split('-').map(Number)
  const months = month - 1 + rule.interval * (rule.freq === 'YEARLY' ? 12 : 1)
  const nextYear = year + Math.floor(months / 12)
  const nextMonth = (months % 12) + 1
  const wanted = rule.byMonthDay ?? date
  const nextDate = Math.min(wanted, daysInMonth(nextYear, nextMonth))
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDate).padStart(2, '0')}`
}

/**
 * What the sample server makes when a repeating task is done (D-84): the first occurrence after the current due day that
 * is not before today, at the same time. Only enough for the sample rules (one weekday a week, a day a month); the real
 * rules belong to the backend.
 */
export function nextOccurrenceSample(task: TaskItem, now: Date): TaskItem | null {
  const due = task.dueDate ?? (task.dueAt ? localDateOf(new Date(task.dueAt), SAMPLE_ZONE) : null)
  if (!task.recurrence || !due) {
    return null
  }
  const today = localDateOf(now, SAMPLE_ZONE)
  let next = step(due, task.recurrence)
  while (next < today) {
    next = step(next, task.recurrence)
  }
  const time = task.dueAt ? formatClock(new Date(task.dueAt), SAMPLE_ZONE) : null
  const dueAt = time ? new Date(`${next}T${time}:00+07:00`).toISOString() : null
  const shift = dueAt && task.dueAt ? Date.parse(dueAt) - Date.parse(task.dueAt) : 0
  return {
    ...task,
    id: crypto.randomUUID(),
    status: 'OPEN',
    dueAt,
    dueDate: task.dueDate ? next : null,
    reminder: task.reminder && task.dueAt ? { at: new Date(Date.parse(task.reminder.at) + shift).toISOString(), state: 'PENDING' } : null,
    createdAt: now.toISOString(),
    completedAt: null,
  }
}
