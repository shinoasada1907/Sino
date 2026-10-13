import { describe, expect, it } from 'vitest'
import type { CalendarData, CalendarEvent, CalendarReminder, CalendarTask } from './calendar.types'
import {
  HOUR_PX,
  agendaDays,
  calendarHead,
  eventKindLabel,
  eventReminder,
  eventWhen,
  itemsOfDay,
  minuteTop,
  monthCells,
  monthItems,
  placeTimedEvents,
  rangeOf,
  reminderTitle,
  shiftAnchor,
  weekDays,
  weekStart,
} from './format'

const TZ = 'Asia/Ho_Chi_Minh'
// Friday 2 October 2026, 14:05 in Vietnam.
const now = new Date('2026-10-02T07:05:00Z')
const TODAY = '2026-10-02'
const vn = (local: string) => new Date(`${local}:00+07:00`).toISOString()

function event(extra: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    eventId: extra.id,
    title: extra.id,
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
    ...extra,
  }
}

function task(extra: Partial<CalendarTask> & { id: string }): CalendarTask {
  return { taskId: extra.id, title: extra.id, status: 'OPEN', dueAt: null, dueDate: null, completedAt: null, recurrence: null, source: null, ...extra }
}

function reminder(extra: Partial<CalendarReminder> & { id: string; at: string }): CalendarReminder {
  return { taskId: 'task-x', taskTitle: extra.id, state: 'PENDING', source: null, ...extra }
}

function data(extra: Partial<CalendarData>): CalendarData {
  return { generatedAt: now.toISOString(), from: '2026-09-28', to: '2026-10-05', providers: [], events: [], tasks: [], reminders: [], ...extra }
}

const weekly = { freq: 'WEEKLY' as const, interval: 1, byWeekdays: ['SUNDAY' as const], byMonthDay: null, untilDate: null, count: null }
const source = { kind: 'MESSAGE' as const, id: 'm', conversationId: 'conv-2', provider: 'zalo', title: 'Gia đình', subject: null, missing: false }

describe('the days of each view', () => {
  it('starts a week on Monday', () => {
    expect(weekStart('2026-10-02')).toBe('2026-09-28')
    expect(weekStart('2026-10-04')).toBe('2026-09-28')
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
  })

  it('asks for a week, the weeks that meet a month, or two weeks from the day of the agenda', () => {
    expect(rangeOf('week', TODAY)).toEqual({ from: '2026-09-28', to: '2026-10-05' })
    expect(rangeOf('month', TODAY)).toEqual({ from: '2026-09-28', to: '2026-11-02' })
    expect(rangeOf('month', '2026-11-15')).toEqual({ from: '2026-10-26', to: '2026-12-07' })
    expect(rangeOf('agenda', TODAY)).toEqual({ from: '2026-10-02', to: '2026-10-16' })
  })

  it('moves by a week, a month (keeping the day where it can) or a week of the agenda', () => {
    expect(shiftAnchor('week', TODAY, 1)).toBe('2026-10-09')
    expect(shiftAnchor('week', TODAY, -1)).toBe('2026-09-25')
    expect(shiftAnchor('month', '2026-10-31', 1)).toBe('2026-11-30')
    expect(shiftAnchor('month', TODAY, -1)).toBe('2026-09-02')
    expect(shiftAnchor('month', '2026-12-15', 1)).toBe('2027-01-15')
    expect(shiftAnchor('agenda', TODAY, -1)).toBe('2026-09-25')
  })

  it('heads each view as the canvas does, with the ISO week', () => {
    expect(calendarHead('week', TODAY, TODAY)).toEqual({ kicker: 'TUẦN 40 · 2026', title: '28/09 – 04/10' })
    expect(calendarHead('week', '2027-01-01', TODAY)).toEqual({ kicker: 'TUẦN 53 · 2026', title: '28/12 – 03/01' })
    // The week of 1 January 2026 starts on Monday 29 December 2025 but holds a Thursday of 2026: week 1 of 2026.
    expect(calendarHead('week', '2026-01-01', TODAY)).toEqual({ kicker: 'TUẦN 1 · 2026', title: '29/12 – 04/01' })
    expect(calendarHead('month', TODAY, TODAY)).toEqual({ kicker: 'THÁNG 10 · 2026', title: 'Tháng 10' })
    expect(calendarHead('agenda', TODAY, TODAY)).toEqual({ kicker: 'TỪ HÔM NAY · 02/10', title: 'Lịch trình' })
    expect(calendarHead('agenda', '2026-10-09', TODAY)).toEqual({ kicker: 'TỪ 09/10', title: 'Lịch trình' })
  })
})

describe('the week', () => {
  it('lists the seven days with today marked and the days before it past', () => {
    const days = weekDays(rangeOf('week', TODAY), TODAY)
    expect(days.map((day) => [day.label, day.num, day.past, day.today])).toEqual([
      ['T2', '28', true, false],
      ['T3', '29', true, false],
      ['T4', '30', true, false],
      ['T5', '01', true, false],
      ['T6', '02', false, true],
      ['T7', '03', false, false],
      ['CN', '04', false, false],
    ])
    expect(days[0].date).toBe('2026-09-28')
  })

  it('places a moment by its minutes in the day, 46 px an hour', () => {
    expect(HOUR_PX).toBe(46)
    expect(minuteTop(vn('2026-10-02T17:00'), TODAY, TZ)).toBe(782)
    expect(minuteTop(vn('2026-10-02T14:05'), TODAY, TZ)).toBeCloseTo(647.83, 1)
  })

  it('places appointments from start to end, side by side where they meet, cut at the ends of the day', () => {
    const placed = placeTimedEvents(
      [
        event({ id: 'call', startsAt: vn('2026-10-02T16:00'), endsAt: vn('2026-10-02T17:00') }),
        event({ id: 'a', startsAt: vn('2026-10-02T10:00'), endsAt: vn('2026-10-02T11:00') }),
        event({ id: 'b', startsAt: vn('2026-10-02T10:30'), endsAt: vn('2026-10-02T12:00') }),
        event({ id: 'late', startsAt: vn('2026-10-02T22:00'), endsAt: vn('2026-10-03T01:00') }),
      ],
      TODAY,
      TZ,
    )
    expect(placed.map(({ event: item, top, height, column, columns }) => [item.id, top, height, column, columns])).toEqual([
      ['a', 460, 46, 0, 2],
      ['b', 483, 69, 1, 2],
      ['call', 736, 46, 0, 1],
      ['late', 1012, 92, 0, 1],
    ])
    const nextDay = placeTimedEvents([event({ id: 'late', startsAt: vn('2026-10-02T22:00'), endsAt: vn('2026-10-03T01:00') })], '2026-10-03', TZ)
    expect(nextDay.map(({ top, height }) => [top, height])).toEqual([[0, 46]])
  })

  it('sorts the items of a day into the whole-day row, the appointments, the task chips and the reminder marks', () => {
    const items = itemsOfDay(
      data({
        events: [
          event({ id: 'birthday', startDate: '2026-10-01', endDate: '2026-10-02' }),
          event({ id: 'trip', startDate: '2026-10-01', endDate: '2026-10-04' }),
          event({ id: 'call', startsAt: vn('2026-10-02T16:00'), endsAt: vn('2026-10-02T17:00') }),
          event({ id: 'other-day', startsAt: vn('2026-10-03T16:00'), endsAt: vn('2026-10-03T17:00') }),
          event({ id: 'overnight', startsAt: vn('2026-10-01T22:00'), endsAt: vn('2026-10-02T01:00') }),
        ],
        tasks: [task({ id: 'photos', dueDate: TODAY }), task({ id: 'rent', dueAt: vn('2026-10-02T17:00') })],
        reminders: [reminder({ id: 'cake', at: vn('2026-10-02T18:00') })],
      }),
      TODAY,
      TZ,
    )
    expect(items.allDay.map((item) => item.id)).toEqual(['trip', 'photos'])
    // An appointment across midnight shows on its second day too.
    expect(items.timed.map((item) => item.id)).toEqual(['call', 'overnight'])
    expect(items.chips.map((item) => item.id)).toEqual(['rent'])
    expect(items.reminders.map((item) => item.id)).toEqual(['cake'])
  })
})

describe('the month', () => {
  it('lists the days of the weeks that meet the month, naming the month at the first cell and at the 1st of another month', () => {
    const cells = monthCells(rangeOf('month', TODAY), TODAY, TODAY)
    expect(cells).toHaveLength(35)
    expect(cells.map((cell) => cell.num).join(' ')).toBe(
      '28/9 29 30 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 1/11',
    )
    expect(cells.filter((cell) => cell.out).map((cell) => cell.num)).toEqual(['28/9', '29', '30', '1/11'])
    expect(cells.filter((cell) => cell.today).map((cell) => cell.date)).toEqual([TODAY])
  })

  it('lists the items of a day: whole-day first, then by time, the time before the title; done and late marked', () => {
    const items = monthItems(
      data({
        events: [event({ id: 'call', title: 'Gọi Minh Anh', startsAt: vn('2026-10-02T16:00'), endsAt: vn('2026-10-02T17:00') })],
        tasks: [
          task({ id: 'rent', title: 'Chuyển tiền nhà', dueAt: vn('2026-10-02T17:00') }),
          task({ id: 'clinic', title: 'Xác nhận lịch khám', status: 'DONE', dueAt: vn('2026-10-02T07:45') }),
          task({ id: 'photos', title: 'Trả lời: Ảnh Đà Lạt', dueDate: TODAY }),
          task({ id: 'late', title: 'Gửi lại hóa đơn', dueAt: vn('2026-10-02T09:00') }),
        ],
        reminders: [reminder({ id: 'cake', taskTitle: 'Mua bánh cho bà', at: vn('2026-10-02T18:00') })],
      }),
      TODAY,
      now,
      TZ,
    )
    expect(items.map((item) => [item.kind, item.text, item.tone])).toEqual([
      ['task', 'Trả lời: Ảnh Đà Lạt', null],
      ['task', '07:45 Xác nhận lịch khám', 'done'],
      ['task', '09:00 Gửi lại hóa đơn', 'over'],
      ['event', '16:00 Gọi Minh Anh', null],
      ['task', '17:00 Chuyển tiền nhà', null],
      ['reminder', '18:00 Mua bánh cho bà', null],
    ])
    expect(items.map((item) => item.to)).toEqual(['/tasks/photos', '/tasks/clinic', '/tasks/late', '/calendar/call', '/tasks/rent', '/tasks/task-x'])
  })

  it('marks each item as the canvas does: done, reminder, source, repeat, then task or appointment', () => {
    const rule = weekly
    const items = monthItems(
      data({
        events: [
          event({ id: 'plain', startsAt: vn('2026-10-02T10:00'), endsAt: vn('2026-10-02T11:00') }),
          event({ id: 'from-chat', startsAt: vn('2026-10-02T11:00'), endsAt: vn('2026-10-02T12:00'), recurrence: rule, source: { ...source, preview: null } }),
          event({ id: 'repeat', startsAt: vn('2026-10-02T12:00'), endsAt: vn('2026-10-02T13:00'), recurrence: rule }),
        ],
        tasks: [
          task({ id: 'done', status: 'DONE', dueAt: vn('2026-10-02T13:00'), source }),
          task({ id: 'task', dueAt: vn('2026-10-02T14:00') }),
          task({ id: 'repeat-task', dueAt: vn('2026-10-02T15:00'), recurrence: rule }),
        ],
        reminders: [reminder({ id: 'r', at: vn('2026-10-02T16:00'), source })],
      }),
      TODAY,
      now,
      TZ,
    )
    expect(items.map((item) => [item.id, item.icon, item.provider])).toEqual([
      ['plain', 'event', null],
      ['from-chat', 'source', 'zalo'],
      ['repeat', 'repeat', null],
      ['done', 'done', null],
      ['task', 'task', null],
      ['repeat-task', 'repeat', null],
      ['r', 'reminder', null],
    ])
  })
})

describe('the month, at one time', () => {
  it('puts the appointment first, then the task, then the reminder', () => {
    const items = monthItems(
      data({
        reminders: [reminder({ id: 'r', taskTitle: 'Nhắc', at: vn('2026-10-05T09:00') })],
        tasks: [task({ id: 't', title: 'Báo cáo tuần', dueAt: vn('2026-10-05T09:00') })],
        events: [event({ id: 'e', title: 'Họp', startsAt: vn('2026-10-05T09:00'), endsAt: vn('2026-10-05T10:00') })],
      }),
      '2026-10-05',
      now,
      TZ,
    )
    expect(items.map((item) => item.kind)).toEqual(['event', 'task', 'reminder'])
  })
})

describe('the agenda', () => {
  const agenda = data({
    from: TODAY,
    to: '2026-10-16',
    events: [
      event({ id: 'call', title: 'Gọi Minh Anh về phụ lục giá', startsAt: vn('2026-10-02T16:00'), endsAt: vn('2026-10-02T17:00'), location: 'Gọi điện', source: { ...source, preview: null } }),
      event({ id: 'home', title: 'Về nhà ăn cơm', startsAt: vn('2026-10-03T18:30'), endsAt: vn('2026-10-03T21:00'), location: 'Nhà bố mẹ', reminder: { at: vn('2026-10-03T17:30'), offsetMinutes: 60, state: 'PENDING' } }),
      event({ id: 'run@2026-10-04', title: 'Chạy bộ Hồ Tây', startsAt: vn('2026-10-04T06:00'), endsAt: vn('2026-10-04T07:00'), location: 'Hồ Tây', recurrence: weekly }),
      event({ id: 'checkup', title: 'Khám sức khỏe', startsAt: vn('2026-10-05T08:30'), endsAt: vn('2026-10-05T09:30'), reminder: { at: vn('2026-10-05T07:30'), offsetMinutes: 60, state: 'PENDING' } }),
      event({ id: 'birthday', title: 'Sinh nhật Hà', startDate: '2026-10-06', endDate: '2026-10-07' }),
    ],
    tasks: [
      task({ id: 'bill', title: 'Gửi lại hóa đơn tháng 9 cho kế toán', dueAt: vn('2026-09-30T17:00') }),
      task({ id: 'clinic', title: 'Xác nhận lịch khám', status: 'DONE', dueAt: vn('2026-10-02T07:45') }),
      task({ id: 'rent', title: 'Chuyển tiền nhà tháng 10', dueAt: vn('2026-10-02T17:00'), recurrence: { ...weekly, freq: 'MONTHLY', byWeekdays: null, byMonthDay: 2 } }),
      task({ id: 'weekly', title: 'Báo cáo tuần', dueAt: vn('2026-10-05T09:00'), recurrence: { ...weekly, byWeekdays: ['MONDAY'] } }),
    ],
    reminders: [
      reminder({ id: 'r-photos', taskTitle: 'Trả lời: Ảnh chuyến đi Đà Lạt', at: vn('2026-10-02T09:00'), state: 'FIRED' }),
      reminder({ id: 'r-contract', taskTitle: 'Trả lời: Hợp đồng thuê văn phòng', at: vn('2026-10-05T09:00') }),
    ],
  })

  it('groups by day from today, with the late tasks first in today, and leaves empty days out', () => {
    const days = agendaDays(agenda, now, TZ)
    expect(days.map((day) => [day.label, day.spec, day.items.map((item) => item.id)])).toEqual([
      ['Hôm nay', 'THỨ SÁU 02/10', ['bill', 'clinic', 'r-photos', 'call', 'rent']],
      ['Ngày mai', 'THỨ BẢY 03/10', ['home']],
      ['Chủ nhật', 'CHỦ NHẬT 04/10', ['run@2026-10-04']],
      ['Thứ Hai', 'THỨ HAI 05/10', ['checkup', 'weekly', 'r-contract']],
      ['Thứ Ba', 'THỨ BA 06/10', ['birthday']],
    ])
    // A phone writes the day on the label's line (canvas `.mob .ag-date`), so a weekday is not said twice.
    expect(days.map((day) => day.shortSpec)).toEqual(['THỨ SÁU 02/10', 'THỨ BẢY 03/10', '04/10', '05/10', '06/10'])
  })

  it('writes each item: its time, its title, and the note on the right', () => {
    const items = agendaDays(agenda, now, TZ).flatMap((day) => day.items)
    expect(items.map((item) => [item.time, item.title, item.note?.text ?? null, item.note?.tone ?? null])).toEqual([
      ['Hạn 30/09', 'Gửi lại hóa đơn tháng 9 cho kế toán', 'Quá hạn 2 ngày', 'err'],
      ['07:45', 'Xác nhận lịch khám', 'Đã xong', null],
      ['09:00', 'Nhắc: Trả lời “Ảnh chuyến đi Đà Lạt”', 'Đã báo', null],
      ['16:00 – 17:00', 'Gọi Minh Anh về phụ lục giá', 'sau 2 giờ', null],
      ['17:00', 'Chuyển tiền nhà tháng 10', 'Hằng tháng · ngày 2', null],
      ['18:30 – 21:00', 'Về nhà ăn cơm', 'Nhà bố mẹ', null],
      ['06:00 – 07:00', 'Chạy bộ Hồ Tây', 'Mỗi Chủ nhật', null],
      ['08:30 – 09:30', 'Khám sức khỏe', 'nhắc 07:30', null],
      ['09:00', 'Báo cáo tuần', 'Mỗi thứ Hai', null],
      ['09:00', 'Nhắc: Trả lời “Hợp đồng thuê văn phòng”', null, null],
      ['cả ngày', 'Sinh nhật Hà', null, null],
    ])
    // The 48 px time column of a phone: the start, or the day a late task was due.
    expect(items.map((item) => item.shortTime)).toEqual(['30/09', '07:45', '09:00', '16:00', '17:00', '18:30', '06:00', '08:30', '09:00', '09:00', 'cả ngày'])
    expect(items[0]).toMatchObject({ kind: 'task', over: true, done: false, to: '/tasks/bill', icon: 'task' })
    expect(items[1]).toMatchObject({ icon: 'done' })
    expect(items[2]).toMatchObject({ icon: 'reminder' })
    expect(items[3]).toMatchObject({ kind: 'event', to: '/calendar/call', source: { title: 'Gia đình' }, icon: 'source', provider: 'zalo' })
    expect(items[4]).toMatchObject({ icon: 'repeat' })
  })

  it('starts from a later day when asked, with the late tasks still opening today when today is that day', () => {
    expect(agendaDays(agenda, now, TZ, '2026-10-04').map((day) => day.date)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06'])
    const week = { ...agenda, from: '2026-09-28' }
    const [today] = agendaDays(week, now, TZ, TODAY)
    expect(today.date).toBe(TODAY)
    expect(today.items[0].id).toBe('bill')
  })

  it('names a reminder by its task', () => {
    expect(reminderTitle('Trả lời: Ảnh chuyến đi Đà Lạt')).toBe('Nhắc: Trả lời “Ảnh chuyến đi Đà Lạt”')
    expect(reminderTitle('Mua bánh bông lan trứng muối cho bà')).toBe('Nhắc: Mua bánh bông lan trứng muối cho bà')
  })
})

describe('the detail of an appointment', () => {
  it('names its kind and writes when it is', () => {
    expect(eventKindLabel(event({ id: 'a' }))).toBe('Lịch hẹn')
    expect(eventKindLabel(event({ id: 'a', recurrence: weekly }))).toBe('Lịch hẹn lặp lại')
    expect(eventWhen(event({ id: 'a', startsAt: vn('2026-10-03T18:30'), endsAt: vn('2026-10-03T21:00') }), now, TZ)).toBe('Thứ Bảy 03/10 · 18:30 – 21:00')
    expect(eventWhen(event({ id: 'a', startsAt: vn('2026-10-02T16:00'), endsAt: vn('2026-10-02T17:00') }), now, TZ)).toBe('Hôm nay, Thứ Sáu 02/10 · 16:00 – 17:00')
    expect(eventWhen(event({ id: 'a', startDate: '2026-10-01', endDate: '2026-10-02' }), now, TZ)).toBe('Thứ Năm 01/10 · cả ngày')
    expect(eventWhen(event({ id: 'a', startDate: '2026-10-01', endDate: '2026-10-04' }), now, TZ)).toBe('Thứ Năm 01/10 – Thứ Bảy 03/10 · cả ngày')
  })

  it('writes the reminder with how long before', () => {
    const at = (time: string, offsetMinutes: number) => event({ id: 'a', reminder: { at: vn(`2026-10-03T${time}`), offsetMinutes, state: 'PENDING' } })
    expect(eventReminder(at('17:30', 60), TZ)).toBe('17:30 · 1 giờ trước')
    expect(eventReminder(at('15:45', 15), TZ)).toBe('15:45 · 15 phút trước')
    expect(eventReminder(at('17:00', 90), TZ)).toBe('17:00 · 1 giờ 30 phút trước')
    expect(eventReminder(at('09:00', 1440), TZ)).toBe('09:00 · 1 ngày trước')
    expect(eventReminder(event({ id: 'a' }), TZ)).toBe('Không')
  })
})
