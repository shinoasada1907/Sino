import type { TaskItem } from '@/features/tasks/tasks.types'

/**
 * `GET /api/tasks` items as the backend answers them (F16, BE-72), around Friday 2 October 2026, 14:05 in Vietnam:
 * one overdue, one due today that repeats monthly, one next Monday that repeats weekly, one without a due, one done
 * this morning. Reminders, sources and related items are null, as the backend does not have them yet.
 */
export const API_TASKS: TaskItem[] = [
  task({ id: 'task-bill', title: 'Gửi lại hóa đơn tháng 9 cho kế toán', dueAt: '2026-09-30T10:00:00Z', createdAt: '2026-09-28T02:00:00Z' }),
  task({
    id: 'task-rent',
    title: 'Chuyển tiền nhà tháng 10',
    dueAt: '2026-10-02T10:00:00Z',
    recurrence: { freq: 'MONTHLY', interval: 1, byWeekdays: null, byMonthDay: 2, untilDate: null, count: null },
    seriesId: 'series-rent',
    createdAt: '2026-09-02T03:00:00Z',
  }),
  task({
    id: 'task-report',
    title: 'Báo cáo tuần',
    dueAt: '2026-10-05T02:00:00Z',
    recurrence: { freq: 'WEEKLY', interval: 1, byWeekdays: ['MONDAY'], byMonthDay: null, untilDate: null, count: null },
    seriesId: 'series-report',
    createdAt: '2026-09-28T02:30:00Z',
  }),
  task({ id: 'task-print', title: 'Hỏi Hoàng giá in bản thiết kế', createdAt: '2026-10-01T09:00:00Z' }),
  task({
    id: 'task-clinic',
    title: 'Xác nhận lịch khám',
    status: 'DONE',
    dueDate: '2026-10-02',
    completedAt: '2026-10-02T00:45:00Z',
    createdAt: '2026-09-30T01:00:00Z',
  }),
]

/** A task as the API sends it, with the fields this backend leaves null. */
export function task(fields: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  return {
    notes: null,
    status: 'OPEN',
    dueAt: null,
    dueDate: null,
    reminder: null,
    recurrence: null,
    seriesId: null,
    source: null,
    createdAt: '2026-10-01T00:00:00Z',
    completedAt: null,
    related: null,
    ...fields,
  }
}
