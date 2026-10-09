import { describe, expect, it } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { createInboxSample } from '@/features/inbox/inbox.sample'
import { groupTasks, navCountsOf, taskMeta, tasksHeadline } from './format'
import { createTasksSample, nextOccurrenceSample } from './tasks.sample'

const TZ = 'Asia/Ho_Chi_Minh'
// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const now = new Date('2026-10-02T07:05:00Z')
const { tasks } = createTasksSample(now)
const HOUR = 3_600_000

describe('tasks sample data', () => {
  it('heads the page and groups the tasks as the canvas Tasks does', () => {
    expect(tasksHeadline(tasks, now, TZ)).toEqual({ open: '8 việc đang mở', overdue: '1 quá hạn', fromMessages: '5 việc tạo từ tin nhắn' })
    expect(groupTasks(tasks, now, TZ).map((group) => [group.label, group.tasks.map((task) => task.title)])).toEqual([
      ['QUÁ HẠN', ['Gửi lại hóa đơn tháng 9 cho kế toán']],
      ['HÔM NAY · THỨ SÁU 02/10', ['Chuyển tiền nhà tháng 10', 'Trả lời: Ảnh chuyến đi Đà Lạt']],
      ['SẮP TỚI', ['Mua bánh bông lan trứng muối cho bà', 'Báo cáo tuần', 'Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2', 'Gia hạn bảo hiểm TA-2025-0418']],
      ['KHÔNG CÓ HẠN', ['Hỏi Hoàng giá in bản thiết kế']],
      ['ĐÃ XONG', ['Xác nhận lịch khám với Phòng khám Ánh Dương', 'Báo cáo tuần']],
    ])
  })

  it('writes every row line of the canvas', () => {
    const lines = groupTasks(tasks, now, TZ).flatMap((group) =>
      group.tasks.map((task) => [...taskMeta(task, tasks, now, TZ).map((meta) => meta.text), ...(task.source ? [task.source.title] : [])]),
    )
    expect(lines).toEqual([
      ['Hạn 30/09 · trễ 2 ngày', 'Đã nhắc 08:12'],
      ['Hôm nay · 17:00', 'Hằng tháng · ngày 2'],
      ['Hôm nay', 'Đã nhắc 09:00', 'Thu Trang'],
      ['T7 03/10 · 17:00', 'Hôm nay 18:00', 'Gia đình'],
      ['T2 05/10 · 09:00', 'Mỗi thứ Hai'],
      ['T4 07/10 · 17:00', 'T2 05/10 09:00', 'Trần Minh Anh'],
      ['T5 15/10 · cả ngày', 'T2 12/10 09:00', 'Bảo hiểm Tâm An'],
      ['Lê Hoàng'],
      ['Xong 07:45 hôm nay', 'Phòng khám Ánh Dương'],
      ['Xong T2 28/09', 'Đã tạo lần kế tiếp: T2 05/10'],
    ])
  })

  it('counts the same due tasks as the navigation of the shell sample (D-83)', () => {
    const { tasksDue, tasksOverdue } = createShellSample(now).navCounts
    expect(navCountsOf(tasks, now, TZ)).toEqual({ tasksDue, tasksOverdue })
  })

  it('shares the tasks and the conversations of the inbox sample', () => {
    const inbox = createInboxSample(now)
    const conversations = new Set(inbox.conversations.map((item) => item.id))
    for (const task of tasks.filter((item) => item.source && !item.source.missing)) {
      expect(conversations.has(task.source!.conversationId)).toBe(true)
    }
    // The insurance email was removed: the task keeps its source without a way to open it.
    expect(tasks.filter((item) => item.source?.missing).map((item) => item.title)).toEqual(['Gia hạn bảo hiểm TA-2025-0418'])
    expect(tasks.map((task) => task.id)).toEqual(expect.arrayContaining(['task-contract', 'task-cake']))
  })

  it('makes the next occurrence of a repeating task from its due time, not from when it was done (D-84)', () => {
    const rent = tasks.find((task) => task.title === 'Chuyển tiền nhà tháng 10')!
    const next = nextOccurrenceSample(rent, now)!
    expect(next).toMatchObject({ status: 'OPEN', seriesId: rent.seriesId, title: rent.title, dueAt: '2026-11-02T10:00:00.000Z', completedAt: null })
    expect(next.id).not.toBe(rent.id)

    const weekly = tasks.find((task) => task.title === 'Báo cáo tuần' && task.status === 'OPEN')!
    // Done three weeks late: the missed Mondays are skipped.
    expect(nextOccurrenceSample(weekly, new Date('2026-10-21T07:00:00Z'))!.dueAt).toBe('2026-10-26T02:00:00.000Z')
    expect(nextOccurrenceSample(tasks.find((task) => task.recurrence === null)!, now)).toBeNull()

    // A month keeps the first day of the series: 31/10 → 30/11 → 31/12.
    const monthly = { ...rent, dueAt: null, dueDate: '2026-11-30', recurrence: { ...rent.recurrence!, byMonthDay: 31 } }
    expect(nextOccurrenceSample(monthly, now)!.dueDate).toBe('2026-12-31')
    expect(nextOccurrenceSample({ ...monthly, dueDate: '2026-10-31' }, now)!.dueDate).toBe('2026-11-30')
  })

  it('moves with the clock', () => {
    const later = createTasksSample(new Date(now.getTime() + 5 * HOUR)).tasks
    expect(Date.parse(later[0].createdAt) - Date.parse(tasks[0].createdAt)).toBe(5 * HOUR)
  })
})
