import { describe, expect, it } from 'vitest'
import { createTasksSample } from '@/features/tasks/tasks.sample'
import { createCalendarSample } from './calendar.sample'
import { agendaDays, eventReminder, eventWhen, itemsOfDay, monthItems, rangeOf } from './format'

const TZ = 'Asia/Ho_Chi_Minh'
// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const now = new Date('2026-10-02T07:05:00Z')
const TODAY = '2026-10-02'
const HOUR = 3_600_000
const ids = (items: { id: string }[]) => items.map((item) => item.id)

describe('calendar sample data', () => {
  it('fills the week of the canvas, day by day', () => {
    const week = createCalendarSample(now, rangeOf('week', TODAY))
    const day = (date: string) => itemsOfDay(week, date, TZ)

    expect(ids(day('2026-09-28').chips)).toEqual(['task-weekly-0928'])
    expect(ids(day('2026-09-29').timed)).toEqual(['event-design'])
    expect(ids(day('2026-09-30').chips)).toEqual(['task-bill'])
    expect(ids(day('2026-10-01').allDay)).toEqual(['event-birthday'])
    expect(ids(day(TODAY).timed)).toEqual(['event-call'])
    expect(ids(day(TODAY).chips)).toEqual(['task-rent', 'task-clinic'])
    // The bill's reminder fired at 08:12 (canvas Tasks: "Đã nhắc 08:12"); the Calendar canvas leaves it out.
    expect(ids(day(TODAY).reminders)).toEqual(['reminder-task-bill', 'reminder-task-photos', 'reminder-task-cake'])
    expect(ids(day('2026-10-03').chips)).toEqual(['task-cake'])
    expect(ids(day('2026-10-03').timed)).toEqual(['event-home'])
    expect(ids(day('2026-10-04').timed)).toEqual(['event-run@2026-10-04'])
  })

  it('repeats the weekly report and the Sunday run through the month', () => {
    const month = createCalendarSample(now, rangeOf('month', TODAY))
    for (const monday of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']) {
      expect(monthItems(month, monday, now, TZ).map((item) => item.text)).toContain('09:00 Báo cáo tuần')
    }
    for (const sunday of ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']) {
      expect(monthItems(month, sunday, now, TZ).map((item) => item.text)).toContain('06:00 Chạy bộ Hồ Tây')
    }
    // A coming occurrence opens the open task of its series.
    const later = month.tasks.find((task) => task.id === 'task-weekly@2026-10-12')
    expect(later).toMatchObject({ taskId: 'task-weekly', title: 'Báo cáo tuần', status: 'OPEN' })
  })

  it('opens the agenda today as the canvas does, with the late bill first', () => {
    const agenda = createCalendarSample(now, rangeOf('agenda', TODAY))
    const [today, tomorrow] = agendaDays(agenda, now, TZ)
    expect(today.items.map((item) => [item.time, item.title])).toEqual([
      ['Hạn 30/09', 'Gửi lại hóa đơn tháng 9 cho kế toán'],
      ['cả ngày', 'Trả lời: Ảnh chuyến đi Đà Lạt'],
      ['07:45', 'Xác nhận lịch khám với Phòng khám Ánh Dương'],
      ['08:12', 'Nhắc: Gửi lại hóa đơn tháng 9 cho kế toán'],
      ['09:00', 'Nhắc: Trả lời “Ảnh chuyến đi Đà Lạt”'],
      ['16:00 – 17:00', 'Gọi Minh Anh về phụ lục giá'],
      ['17:00', 'Chuyển tiền nhà tháng 10'],
      ['18:00', 'Nhắc: Mua bánh bông lan trứng muối cho bà'],
    ])
    expect(tomorrow.items.map((item) => [item.time, item.title, item.note?.text])).toEqual([
      ['17:00', 'Mua bánh bông lan trứng muối cho bà', undefined],
      ['18:30 – 21:00', 'Về nhà ăn cơm', 'Nhà bố mẹ'],
    ])
  })

  it('details the appointments of the canvas', () => {
    const { events } = createCalendarSample(now, rangeOf('week', TODAY))
    const home = events.find((event) => event.id === 'event-home')!
    expect(eventWhen(home, now, TZ)).toBe('Thứ Bảy 03/10 · 18:30 – 21:00')
    expect(eventReminder(home, TZ)).toBe('17:30 · 1 giờ trước')
    expect(home).toMatchObject({ location: 'Nhà bố mẹ', source: { title: 'Gia đình', provider: 'zalo', preview: 'Mẹ: Cuối tuần này cả nhà về ăn cơm nhé, nhớ mua bánh cho bà.' } })
    const run = events.find((event) => event.id === 'event-run@2026-10-04')!
    expect(eventReminder(run, TZ)).toBe('05:30 · 30 phút trước')
  })

  it('reminds of the nearest run only', () => {
    const month = createCalendarSample(now, rangeOf('month', TODAY))
    const runs = month.events.filter((event) => event.eventId === 'event-run')
    expect(runs.filter((event) => event.reminder).map((event) => event.id)).toEqual(['event-run@2026-10-04'])
  })

  it('takes its tasks from the tasks sample', () => {
    const week = createCalendarSample(now, rangeOf('week', TODAY))
    const titles = new Map(createTasksSample(now).tasks.map((task) => [task.id, task.title]))
    for (const task of week.tasks) {
      expect(task.title).toBe(titles.get(task.taskId))
    }
  })

  it('moves with the clock', () => {
    const later = createCalendarSample(new Date(now.getTime() + 5 * HOUR), rangeOf('week', TODAY))
    const call = (data: typeof later) => data.events.find((event) => event.id === 'event-call')!.startsAt!
    expect(Date.parse(call(later)) - Date.parse(call(createCalendarSample(now, rangeOf('week', TODAY))))).toBe(5 * HOUR)
  })
})
