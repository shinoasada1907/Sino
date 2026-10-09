import { describe, expect, it } from 'vitest'
import {
  createdLabel,
  detailDue,
  detailReminder,
  doneLabel,
  dueLabel,
  filterTasks,
  groupTasks,
  navCountsOf,
  nextOccurrenceLabel,
  recurrenceLabel,
  reminderLabel,
  tasksHeadline,
  openCountLabel,
  taskMeta,
} from './format'
import type { Recurrence, TaskItem } from './tasks.types'

const TZ = 'Asia/Ho_Chi_Minh'
// Friday 2 October 2026, 14:05 in Vietnam.
const now = new Date('2026-10-02T07:05:00Z')
const vn = (local: string) => new Date(`${local}:00+07:00`).toISOString()

function task(extra: Partial<TaskItem> & { id: string }): TaskItem {
  return {
    title: extra.id,
    notes: null,
    status: 'OPEN',
    dueAt: null,
    dueDate: null,
    reminder: null,
    recurrence: null,
    seriesId: null,
    source: null,
    createdAt: vn('2026-09-28T10:00'),
    completedAt: null,
    related: null,
    ...extra,
  }
}

const weekly = (days: Recurrence['byWeekdays'], interval = 1): Recurrence => ({
  freq: 'WEEKLY',
  interval,
  byWeekdays: days,
  byMonthDay: null,
  untilDate: null,
  count: null,
})
const source = { kind: 'MESSAGE' as const, id: 'm-1', conversationId: 'conv-1', provider: 'gmail', title: 'Trần Minh Anh', subject: null, missing: false }

describe('groupTasks', () => {
  it('puts each task in its group, in the order of the canvas, and leaves empty groups out', () => {
    const tasks = [
      task({ id: 'later-today', dueAt: vn('2026-10-02T17:00') }),
      task({ id: 'done-old', status: 'DONE', completedAt: vn('2026-09-28T10:30') }),
      task({ id: 'all-day-today', dueDate: '2026-10-02' }),
      task({ id: 'no-due-old', createdAt: vn('2026-09-20T10:00') }),
      task({ id: 'past-day', dueDate: '2026-09-30' }),
      task({ id: 'tomorrow', dueAt: vn('2026-10-03T17:00') }),
      task({ id: 'done-today', status: 'DONE', dueAt: vn('2026-10-09T09:00'), completedAt: vn('2026-10-02T07:45') }),
      task({ id: 'earlier-today', dueAt: vn('2026-10-02T09:00') }),
      task({ id: 'all-day-later', dueDate: '2026-10-15' }),
      task({ id: 'no-due-new', createdAt: vn('2026-10-01T21:10') }),
    ]

    const groups = groupTasks(tasks, now, TZ)

    expect(groups.map((group) => [group.key, group.label, group.tasks.map((item) => item.id)])).toEqual([
      ['OVERDUE', 'QUÁ HẠN', ['past-day', 'earlier-today']],
      ['TODAY', 'HÔM NAY · THỨ SÁU 02/10', ['later-today', 'all-day-today']],
      ['UPCOMING', 'SẮP TỚI', ['tomorrow', 'all-day-later']],
      ['NO_DUE', 'KHÔNG CÓ HẠN', ['no-due-new', 'no-due-old']],
      ['DONE', 'ĐÃ XONG', ['done-today', 'done-old']],
    ])
    expect(groupTasks([task({ id: 'only', dueDate: '2026-10-15' })], now, TZ).map((group) => group.key)).toEqual(['UPCOMING'])
  })

  it('counts a due time as overdue only once it has passed', () => {
    expect(groupTasks([task({ id: 'a', dueAt: now.toISOString() })], now, TZ)[0].key).toBe('TODAY')
    expect(dueLabel(task({ id: 'a', dueAt: now.toISOString() }), now, TZ)).toBe('Hôm nay · 14:05')
  })

  it('counts a due day as overdue only after the day ends', () => {
    expect(groupTasks([task({ id: 'a', dueDate: '2026-10-02' })], now, TZ)[0].key).toBe('TODAY')
    expect(groupTasks([task({ id: 'a', dueDate: '2026-10-01' })], now, TZ)[0].key).toBe('OVERDUE')
  })
})

describe('the lines of a task row', () => {
  it('writes the due time: late by days or hours, today, upcoming, a whole day', () => {
    expect(dueLabel(task({ id: 'a', dueDate: '2026-09-30' }), now, TZ)).toBe('Hạn 30/09 · trễ 2 ngày')
    expect(dueLabel(task({ id: 'a', dueAt: vn('2026-10-01T09:00') }), now, TZ)).toBe('Hạn 01/10 · trễ 1 ngày')
    expect(dueLabel(task({ id: 'a', dueAt: vn('2026-10-02T09:00') }), now, TZ)).toBe('Hạn 09:00 · trễ 5 giờ')
    expect(dueLabel(task({ id: 'a', dueAt: vn('2026-10-02T13:50') }), now, TZ)).toBe('Hạn 13:50 · trễ 15 phút')
    expect(dueLabel(task({ id: 'a', dueAt: vn('2026-10-02T13:20') }), now, TZ)).toBe('Hạn 13:20 · trễ 45 phút')
    expect(dueLabel(task({ id: 'a', dueAt: vn('2026-10-02T17:00') }), now, TZ)).toBe('Hôm nay · 17:00')
    expect(dueLabel(task({ id: 'a', dueDate: '2026-10-02' }), now, TZ)).toBe('Hôm nay')
    expect(dueLabel(task({ id: 'a', dueAt: vn('2026-10-03T17:00') }), now, TZ)).toBe('T7 03/10 · 17:00')
    expect(dueLabel(task({ id: 'a', dueDate: '2026-10-15' }), now, TZ)).toBe('T5 15/10 · cả ngày')
    expect(dueLabel(task({ id: 'a' }), now, TZ)).toBeNull()
  })

  it('writes the reminder: when it fired, or when it will', () => {
    expect(reminderLabel(task({ id: 'a', reminder: { at: vn('2026-10-02T08:12'), state: 'FIRED' } }), now, TZ)).toBe('Đã nhắc 08:12')
    expect(reminderLabel(task({ id: 'a', reminder: { at: vn('2026-10-01T08:12'), state: 'FIRED' } }), now, TZ)).toBe('Đã nhắc T5 01/10 08:12')
    expect(reminderLabel(task({ id: 'a', reminder: { at: vn('2026-10-02T18:00'), state: 'PENDING' } }), now, TZ)).toBe('Hôm nay 18:00')
    expect(reminderLabel(task({ id: 'a', reminder: { at: vn('2026-10-05T09:00'), state: 'PENDING' } }), now, TZ)).toBe('T2 05/10 09:00')
    expect(reminderLabel(task({ id: 'a' }), now, TZ)).toBeNull()
  })

  it('names the repeat rule', () => {
    expect(recurrenceLabel(weekly(['MONDAY']))).toBe('Mỗi thứ Hai')
    expect(recurrenceLabel(weekly(['SUNDAY']))).toBe('Mỗi Chủ nhật')
    expect(recurrenceLabel(weekly(['MONDAY', 'THURSDAY']))).toBe('Mỗi thứ Hai, thứ Năm')
    expect(recurrenceLabel(weekly(['MONDAY'], 2))).toBe('2 tuần một lần · thứ Hai')
    expect(recurrenceLabel({ ...weekly(null), freq: 'MONTHLY', byMonthDay: 2 })).toBe('Hằng tháng · ngày 2')
    expect(recurrenceLabel({ ...weekly(null), freq: 'MONTHLY', interval: 3, byMonthDay: 31 })).toBe('3 tháng một lần · ngày 31')
    expect(recurrenceLabel({ ...weekly(null), freq: 'DAILY' })).toBe('Hằng ngày')
    expect(recurrenceLabel({ ...weekly(null), freq: 'DAILY', interval: 2 })).toBe('2 ngày một lần')
    expect(recurrenceLabel({ ...weekly(null), freq: 'YEARLY' })).toBe('Hằng năm')
    expect(recurrenceLabel(null)).toBeNull()
  })

  it('says when a task was done, and the next occurrence of a repeating one', () => {
    const done = (at: string) => task({ id: 'a', status: 'DONE', completedAt: vn(at) })
    expect(doneLabel(done('2026-10-02T07:45'), now, TZ)).toBe('Xong 07:45 hôm nay')
    expect(doneLabel(done('2026-10-01T20:10'), now, TZ)).toBe('Xong 20:10 hôm qua')
    expect(doneLabel(done('2026-09-28T10:30'), now, TZ)).toBe('Xong T2 28/09')

    const series = [
      task({ id: 'old', status: 'DONE', seriesId: 's', completedAt: vn('2026-09-28T10:30') }),
      task({ id: 'next', seriesId: 's', dueAt: vn('2026-10-05T09:00') }),
      task({ id: 'other', seriesId: 'x', dueDate: '2026-10-15' }),
    ]
    expect(nextOccurrenceLabel(series[0], series, TZ)).toBe('Đã tạo lần kế tiếp: T2 05/10')
    expect(nextOccurrenceLabel({ ...series[0], seriesId: 'x' }, series, TZ)).toBe('Đã tạo lần kế tiếp: T5 15/10')
    expect(nextOccurrenceLabel({ ...series[0], seriesId: null }, series, TZ)).toBeNull()
    // Only an open occurrence is the next one; an open task has no "next" line.
    expect(nextOccurrenceLabel(series[0], [series[0], { ...series[1], status: 'DONE' }], TZ)).toBeNull()
    expect(nextOccurrenceLabel(series[1], [...series, { ...series[1], id: 'next-2', dueAt: vn('2026-10-12T09:00') }], TZ)).toBeNull()
  })
})

describe('taskMeta', () => {
  it('lists the lines of an open row: due (late in red, today bold), reminder, repeat', () => {
    expect(taskMeta(task({ id: 'a', dueDate: '2026-09-30', reminder: { at: vn('2026-10-02T08:12'), state: 'FIRED' } }), [], now, TZ)).toEqual([
      { icon: 'due', text: 'Hạn 30/09 · trễ 2 ngày', tone: 'over' },
      { icon: 'reminder', text: 'Đã nhắc 08:12', tone: null },
    ])
    const rule = { ...weekly(null), freq: 'MONTHLY' as const, byMonthDay: 2 }
    expect(taskMeta(task({ id: 'a', dueAt: vn('2026-10-02T17:00'), recurrence: rule }), [], now, TZ)).toEqual([
      { icon: 'today', text: 'Hôm nay · 17:00', tone: 'today' },
      { icon: 'repeat', text: 'Hằng tháng · ngày 2', tone: null },
    ])
    expect(taskMeta(task({ id: 'a', dueDate: '2026-10-15' }), [], now, TZ)).toEqual([{ icon: 'due', text: 'T5 15/10 · cả ngày', tone: null }])
    expect(taskMeta(task({ id: 'a' }), [], now, TZ)).toEqual([])
  })

  it('lists for a done row when it was done and the next occurrence, without its rule or reminder', () => {
    const done = task({ id: 'old', status: 'DONE', seriesId: 's', recurrence: weekly(['MONDAY']), completedAt: vn('2026-09-28T10:30') })
    const next = task({ id: 'next', seriesId: 's', dueAt: vn('2026-10-05T09:00') })
    expect(taskMeta(done, [done, next], now, TZ)).toEqual([
      { icon: 'done', text: 'Xong T2 28/09', tone: null },
      { icon: 'repeat', text: 'Đã tạo lần kế tiếp: T2 05/10', tone: null },
    ])
  })
})

describe('counts', () => {
  const tasks = [
    task({ id: 'late', dueDate: '2026-09-30' }),
    task({ id: 'today', dueAt: vn('2026-10-02T17:00'), source }),
    task({ id: 'later', dueDate: '2026-10-15', source }),
    task({ id: 'done', status: 'DONE', source, completedAt: vn('2026-10-02T07:45') }),
  ]

  it('heads the page with what is open, late and made from messages', () => {
    expect(tasksHeadline(tasks, now, TZ)).toEqual({ open: '3 việc đang mở', overdue: '1 quá hạn', fromMessages: '2 việc tạo từ tin nhắn' })
    expect(tasksHeadline([tasks[2]], now, TZ)).toEqual({ open: '1 việc đang mở', overdue: null, fromMessages: '1 việc tạo từ tin nhắn' })
    expect(tasksHeadline([tasks[3]], now, TZ)).toEqual({ open: 'Không có việc nào đang mở', overdue: null, fromMessages: null })
    expect(openCountLabel(tasks)).toBe('3 đang mở')
  })

  it('counts for the navigation the tasks that are due, and the late ones (D-83)', () => {
    expect(navCountsOf(tasks, now, TZ)).toEqual({ tasksDue: 2, tasksOverdue: 1 })
    expect(navCountsOf([tasks[2], tasks[3]], now, TZ)).toEqual({ tasksDue: 0, tasksOverdue: 0 })
  })

  it('filters by source and by repeat', () => {
    const repeating = task({ id: 'repeat', recurrence: weekly(['MONDAY']) })
    const all = [...tasks, repeating]
    expect(filterTasks(all, 'all')).toEqual(all)
    expect(filterTasks(all, 'messages').map((item) => item.id)).toEqual(['today', 'later', 'done'])
    expect(filterTasks(all, 'repeat').map((item) => item.id)).toEqual(['repeat'])
  })
})

describe('the detail of a task', () => {
  it('writes the due time, the reminder and when it was made in full', () => {
    expect(detailDue(task({ id: 'a', dueAt: vn('2026-10-07T17:00') }), TZ)).toBe('Thứ Tư 07/10 · 17:00')
    expect(detailDue(task({ id: 'a', dueDate: '2026-10-15' }), TZ)).toBe('Thứ Năm 15/10 · cả ngày')
    expect(detailDue(task({ id: 'a' }), TZ)).toBe('Không có hạn')
    expect(detailReminder(task({ id: 'a', reminder: { at: vn('2026-10-05T09:00'), state: 'PENDING' } }), TZ)).toBe('Thứ Hai 05/10 · 09:00')
    expect(detailReminder(task({ id: 'a', reminder: { at: vn('2026-10-02T08:12'), state: 'FIRED' } }), TZ)).toBe('Đã nhắc · Thứ Sáu 02/10 · 08:12')
    expect(detailReminder(task({ id: 'a' }), TZ)).toBe('Không')
    expect(createdLabel(task({ id: 'a', createdAt: vn('2026-10-02T09:52'), source }), now, TZ)).toBe('09:52 hôm nay, từ Hộp thư')
    expect(createdLabel(task({ id: 'a', createdAt: vn('2026-10-01T21:10') }), now, TZ)).toBe('21:10 hôm qua')
    expect(createdLabel(task({ id: 'a', createdAt: vn('2026-09-28T10:00') }), now, TZ)).toBe('T2 28/09 10:00')
  })
})
