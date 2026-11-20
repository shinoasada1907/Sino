import { describe, expect, it } from 'vitest'
import type { Recurrence } from '@/features/tasks/tasks.types'
import { ApiError } from '@/shared/api/problem'
import { storedEvent } from '@/test/fixtures/calendarApi'
import { bodyOfEvent, emptyEventForm, errorsOfEvent, formOfEvent, validateEvent, type EventFormValues } from './eventForm'

const rule = (fields: Partial<Recurrence> & Pick<Recurrence, 'freq'>): Recurrence => ({
  interval: 1,
  byWeekdays: null,
  byMonthDay: null,
  untilDate: null,
  count: null,
  ...fields,
})

describe('the values of the appointment form', () => {
  it('starts a new appointment on the given date at 09:00 – 10:00 with no repeat', () => {
    expect(emptyEventForm('2026-10-08')).toEqual({
      title: '',
      date: '2026-10-08',
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
        byWeekdays: ['THURSDAY'],
        end: 'NEVER',
        untilDate: '',
        count: 10,
      },
      monthDay: null,
    })
  })

  it('reads a timed appointment and an all-day appointment in Vietnam', () => {
    const timed = storedEvent({
      id: 'event-team',
      title: 'Họp nhóm',
      startsAt: '2026-10-08T03:00:00Z',
      endsAt: '2026-10-08T04:00:00Z',
      location: 'Phòng 3',
      notes: 'Mang laptop.',
      recurrence: rule({ freq: 'WEEKLY', byWeekdays: ['THURSDAY'] }),
    })
    expect(formOfEvent(timed)).toMatchObject({
      title: 'Họp nhóm',
      date: '2026-10-08',
      allDay: false,
      startTime: '10:00',
      endTime: '11:00',
      daySpan: 0,
      location: 'Phòng 3',
      notes: 'Mang laptop.',
      repeat: 'WEEKLY',
    })

    const allDay = storedEvent({
      id: 'event-trip',
      title: 'Về quê',
      startDate: '2026-10-03',
      endDate: '2026-10-05',
    })
    expect(formOfEvent(allDay)).toMatchObject({
      title: 'Về quê',
      date: '2026-10-03',
      allDay: true,
      daySpan: 2,
      repeat: 'NONE',
    })
  })

  it('names a plain rule by its preset and anything else "Tùy chỉnh…"', () => {
    const span = { startsAt: '2026-10-05T02:00:00Z', endsAt: '2026-10-05T03:00:00Z' } // Monday
    const repeat = (recurrence: Recurrence) => formOfEvent(storedEvent({ id: 'a', title: 'A', ...span, recurrence })).repeat

    expect(repeat(rule({ freq: 'DAILY' }))).toBe('DAILY')
    expect(repeat(rule({ freq: 'WEEKLY', byWeekdays: ['MONDAY'] }))).toBe('WEEKLY')
    expect(repeat(rule({ freq: 'MONTHLY', byMonthDay: 5 }))).toBe('MONTHLY')
    expect(repeat(rule({ freq: 'YEARLY', byMonthDay: 5 }))).toBe('YEARLY')
    expect(repeat(rule({ freq: 'DAILY', interval: 2 }))).toBe('CUSTOM')
    expect(repeat(rule({ freq: 'WEEKLY', byWeekdays: ['MONDAY', 'THURSDAY'] }))).toBe('CUSTOM')
    expect(repeat(rule({ freq: 'MONTHLY', byMonthDay: 5, count: 6 }))).toBe('CUSTOM')
    expect(repeat(rule({ freq: 'DAILY', untilDate: '2026-12-31' }))).toBe('CUSTOM')
  })
})

describe('the body the appointment form sends (POST /api/events, PUT /api/events/{id})', () => {
  const values = (fields: Partial<EventFormValues>): EventFormValues => ({
    ...emptyEventForm('2026-10-08'),
    title: 'Họp nhóm',
    ...fields,
  })

  it('sends a timed appointment as instants in Vietnam and an all-day appointment as exclusive dates', () => {
    expect(bodyOfEvent(values({ startTime: '10:00', endTime: '11:00', location: ' Phòng 3 ', notes: '  ' }))).toEqual({
      title: 'Họp nhóm',
      startsAt: '2026-10-08T03:00:00.000Z',
      endsAt: '2026-10-08T04:00:00.000Z',
      startDate: null,
      endDate: null,
      location: 'Phòng 3',
      notes: null,
      recurrence: null,
    })

    expect(bodyOfEvent(values({ allDay: true, daySpan: 1 }))).toEqual({
      title: 'Họp nhóm',
      startsAt: null,
      endsAt: null,
      startDate: '2026-10-08',
      endDate: '2026-10-09',
      location: null,
      notes: null,
      recurrence: null,
    })
  })

  it('keeps the first day of a monthly rule while the date still fits it', () => {
    const stored = formOfEvent(
      storedEvent({ id: 'a', title: 'A', startDate: '2026-11-30', endDate: '2026-12-01', recurrence: rule({ freq: 'MONTHLY', byMonthDay: 31 }) }),
    )

    expect(bodyOfEvent(stored).recurrence?.byMonthDay).toBe(31)
    expect(bodyOfEvent({ ...stored, date: '2026-11-29' }).recurrence?.byMonthDay).toBeNull()
  })
})

describe('what the appointment form checks before it sends', () => {
  const values = (fields: Partial<EventFormValues>): EventFormValues => ({
    ...emptyEventForm('2026-10-08'),
    title: 'Họp nhóm',
    ...fields,
  })
  const custom = (fields: Partial<EventFormValues['custom']>) => values({ repeat: 'CUSTOM', custom: { ...values({}).custom, ...fields } })

  it('needs a title and a date', () => {
    expect(validateEvent(values({}))).toEqual({})
    expect(validateEvent(values({ title: '  ' }))).toEqual({ title: 'Tiêu đề không được để trống.' })
    expect(validateEvent(values({ date: '' }))).toEqual({ date: 'Chọn ngày cho lịch hẹn.' })
  })

  it('needs an end time after the start time on the same day unless the appointment is all-day', () => {
    expect(validateEvent(values({ startTime: '11:00', endTime: '10:00' }))).toEqual({ time: 'Giờ kết thúc phải sau giờ bắt đầu.' })
    expect(validateEvent(values({ startTime: '10:00', endTime: '10:00' }))).toEqual({ time: 'Giờ kết thúc phải sau giờ bắt đầu.' })
    expect(validateEvent(values({ startTime: '11:00', endTime: '10:00', allDay: true, daySpan: 1 }))).toEqual({})
    expect(validateEvent(values({ startTime: '', endTime: '10:00' }))).toEqual({ time: 'Nhập giờ theo dạng 14:30.' })
    expect(validateEvent(values({ daySpan: 15 }))).toEqual({ time: 'Lịch hẹn kéo dài tối đa 14 ngày.' })
  })

  it('checks the custom rule only while it is the one chosen', () => {
    expect(validateEvent(custom({ interval: 0 }))).toEqual({ interval: 'Nhập một số từ 1 đến 99.' })
    expect(validateEvent(custom({ byWeekdays: [] }))).toEqual({ weekdays: 'Chọn ít nhất một thứ.' })
    expect(validateEvent(custom({ end: 'UNTIL', untilDate: '2026-10-07' }))).toEqual({ end: 'Ngày kết thúc không được trước ngày bắt đầu.' })
    expect(validateEvent(custom({ end: 'COUNT', count: 0 }))).toEqual({ end: 'Nhập một số từ 1 đến 999.' })
  })
})

describe('where a refusal of the server shows', () => {
  const FAILED = { form: 'Không lưu được lịch hẹn. Hãy thử lại.' }

  it('puts a rule that does not fit the start day next to the repeat', () => {
    expect(errorsOfEvent(new ApiError(422, 'INVALID_RECURRENCE', 'The weekdays…'))).toEqual({
      repeat: 'Lặp lại không khớp với ngày bắt đầu.',
    })
  })

  it('puts each refused field of a 400 next to its box', () => {
    const refused = (...fields: string[]) =>
      errorsOfEvent(new ApiError(400, 'VALIDATION_FAILED', null, fields.map((field) => ({ field, message: 'in English' }))))

    expect(refused('title', 'location', 'notes')).toEqual({
      title: 'Tiêu đề không hợp lệ.',
      location: 'Địa điểm không hợp lệ.',
      notes: 'Ghi chú không hợp lệ.',
    })
    expect(refused('endAfterStart')).toEqual({ time: 'Giờ kết thúc phải sau giờ bắt đầu.' })
    expect(refused('shortEnough')).toEqual({ time: 'Lịch hẹn kéo dài tối đa 14 ngày.' })
    expect(refused('startDate')).toEqual({ date: 'Ngày không hợp lệ.' })
    expect(refused('recurrence.interval')).toEqual({ repeat: 'Lặp lại không hợp lệ.' })
    expect(refused('somethingElse')).toEqual(FAILED)
  })

  it('says the save failed for anything else', () => {
    expect(errorsOfEvent(new ApiError(500, 'INTERNAL_ERROR', null))).toEqual(FAILED)
    expect(errorsOfEvent(new Error('boom'))).toEqual(FAILED)
  })
})
