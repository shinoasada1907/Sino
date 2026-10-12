import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/problem'
import { task } from '@/test/fixtures/tasksApi'
import { errorsOf, formOf, scheduleOf, validate, type TaskFormValues } from './taskForm'
import type { Recurrence } from './tasks.types'

const rule = (fields: Partial<Recurrence> & Pick<Recurrence, 'freq'>): Recurrence => ({
  interval: 1,
  byWeekdays: null,
  byMonthDay: null,
  untilDate: null,
  count: null,
  ...fields,
})

describe('the values of the task form', () => {
  it('starts a task without a due with an empty date, the whole day and no repeat', () => {
    expect(formOf(task({ id: 'a', title: 'Gọi thợ', notes: 'Hỏi giá' }))).toMatchObject({
      title: 'Gọi thợ',
      notes: 'Hỏi giá',
      date: '',
      time: 'ALL_DAY',
      repeat: 'NONE',
    })
  })

  it('reads a due moment as its day and time in Vietnam', () => {
    // 18:00 UTC on Sunday 4 October is Monday 5 October 01:00 in Vietnam.
    expect(formOf(task({ id: 'a', title: 'A', dueAt: '2026-10-04T18:00:00Z' }))).toMatchObject({ date: '2026-10-05', time: '01:00' })
    expect(formOf(task({ id: 'a', title: 'A', dueDate: '2026-10-09' }))).toMatchObject({ date: '2026-10-09', time: 'ALL_DAY' })
  })

  it('names a plain rule by its preset and anything else "Tùy chỉnh…"', () => {
    const due = { dueAt: '2026-10-05T02:00:00Z' } // Monday
    const repeat = (recurrence: Recurrence) => formOf(task({ id: 'a', title: 'A', ...due, recurrence })).repeat

    expect(repeat(rule({ freq: 'DAILY' }))).toBe('DAILY')
    expect(repeat(rule({ freq: 'WEEKLY', byWeekdays: ['MONDAY'] }))).toBe('WEEKLY')
    expect(repeat(rule({ freq: 'MONTHLY', byMonthDay: 5 }))).toBe('MONTHLY')
    expect(repeat(rule({ freq: 'YEARLY', byMonthDay: 5 }))).toBe('YEARLY')
    expect(repeat(rule({ freq: 'DAILY', interval: 2 }))).toBe('CUSTOM')
    expect(repeat(rule({ freq: 'WEEKLY', byWeekdays: ['MONDAY', 'THURSDAY'] }))).toBe('CUSTOM')
    expect(repeat(rule({ freq: 'MONTHLY', byMonthDay: 5, count: 6 }))).toBe('CUSTOM')
    expect(repeat(rule({ freq: 'DAILY', untilDate: '2026-12-31' }))).toBe('CUSTOM')
  })

  it('fills the custom part from the rule, or from the due when there is none', () => {
    const custom = formOf(
      task({ id: 'a', title: 'A', dueDate: '2026-10-05', recurrence: rule({ freq: 'WEEKLY', interval: 2, byWeekdays: ['MONDAY', 'THURSDAY'], untilDate: '2026-12-31' }) }),
    ).custom
    expect(custom).toEqual({ freq: 'WEEKLY', interval: 2, byWeekdays: ['MONDAY', 'THURSDAY'], end: 'UNTIL', untilDate: '2026-12-31', count: 10 })

    expect(formOf(task({ id: 'a', title: 'A', dueDate: '2026-10-09' })).custom).toEqual({
      freq: 'WEEKLY',
      interval: 1,
      byWeekdays: ['FRIDAY'],
      end: 'NEVER',
      untilDate: '',
      count: 10,
    })
  })
})

describe('the schedule the form sends (PUT /api/tasks/{id}/schedule)', () => {
  const values = (fields: Partial<TaskFormValues>): TaskFormValues => ({
    ...formOf(task({ id: 'a', title: 'A' })),
    ...fields,
  })

  it('sends nothing without a date, whatever the repeat says', () => {
    expect(scheduleOf(values({ date: '', repeat: 'WEEKLY' }))).toEqual({ dueAt: null, dueDate: null, recurrence: null })
  })

  it('sends a whole day as a date and a time as a moment in Vietnam', () => {
    expect(scheduleOf(values({ date: '2026-10-09', time: 'ALL_DAY' }))).toEqual({ dueAt: null, dueDate: '2026-10-09', recurrence: null })
    expect(scheduleOf(values({ date: '2026-10-09', time: '17:00' }))).toEqual({ dueAt: '2026-10-09T10:00:00.000Z', dueDate: null, recurrence: null })
  })

  it('makes the presets from the date', () => {
    const recurrence = (repeat: TaskFormValues['repeat']) => scheduleOf(values({ date: '2026-10-09', repeat })).recurrence

    expect(recurrence('DAILY')).toEqual(rule({ freq: 'DAILY' }))
    expect(recurrence('WEEKLY')).toEqual(rule({ freq: 'WEEKLY', byWeekdays: ['FRIDAY'] }))
    expect(recurrence('MONTHLY')).toEqual(rule({ freq: 'MONTHLY' }))
    expect(recurrence('YEARLY')).toEqual(rule({ freq: 'YEARLY' }))
  })

  it('keeps the first day of a monthly rule while the date still fits it', () => {
    // The rule began on the 31st; this occurrence fell on 30/11, the end of a short month.
    const stored = formOf(task({ id: 'a', title: 'A', dueDate: '2026-11-30', recurrence: rule({ freq: 'MONTHLY', byMonthDay: 31 }) }))

    expect(scheduleOf(stored).recurrence?.byMonthDay).toBe(31)
    expect(scheduleOf({ ...stored, date: '2026-11-29' }).recurrence?.byMonthDay).toBeNull()
  })

  it('sends a custom rule with its end', () => {
    const custom = { freq: 'WEEKLY' as const, interval: 2, byWeekdays: ['THURSDAY', 'MONDAY'] as const, untilDate: '2026-12-31', count: 4 }

    expect(scheduleOf(values({ date: '2026-10-05', repeat: 'CUSTOM', custom: { ...custom, byWeekdays: [...custom.byWeekdays], end: 'UNTIL' } })).recurrence).toEqual(
      rule({ freq: 'WEEKLY', interval: 2, byWeekdays: ['MONDAY', 'THURSDAY'], untilDate: '2026-12-31' }),
    )
    expect(scheduleOf(values({ date: '2026-10-05', repeat: 'CUSTOM', custom: { ...custom, byWeekdays: [...custom.byWeekdays], end: 'COUNT' } })).recurrence).toEqual(
      rule({ freq: 'WEEKLY', interval: 2, byWeekdays: ['MONDAY', 'THURSDAY'], count: 4 }),
    )
    expect(scheduleOf(values({ date: '2026-10-05', repeat: 'CUSTOM', custom: { ...custom, freq: 'DAILY', byWeekdays: ['MONDAY'], end: 'NEVER' } })).recurrence).toEqual(
      rule({ freq: 'DAILY', interval: 2 }),
    )
  })
})

describe('what the form checks before it sends', () => {
  const values = (fields: Partial<TaskFormValues>): TaskFormValues => ({
    ...formOf(task({ id: 'a', title: 'A', dueDate: '2026-10-05' })),
    ...fields,
  })
  const custom = (fields: Partial<TaskFormValues['custom']>) => values({ repeat: 'CUSTOM', custom: { ...values({}).custom, ...fields } })

  it('needs a title', () => {
    expect(validate(values({}))).toEqual({})
    expect(validate(values({ title: '  ' }))).toEqual({ title: 'Tiêu đề không được để trống.' })
  })

  it('needs a time of day unless the due is the whole day', () => {
    expect(validate(values({ time: '14:30' }))).toEqual({})
    expect(validate(values({ time: '' }))).toEqual({ time: 'Nhập giờ theo dạng 14:30.' })
    expect(validate(values({ date: '', time: '' }))).toEqual({})
  })

  it('checks the custom rule only while it is the one chosen', () => {
    expect(validate(custom({ interval: 0 }))).toEqual({ interval: 'Nhập một số từ 1 đến 99.' })
    expect(validate(custom({ interval: 100 }))).toEqual({ interval: 'Nhập một số từ 1 đến 99.' })
    expect(validate(custom({ interval: 99 }))).toEqual({})
    expect(validate(custom({ byWeekdays: [] }))).toEqual({ weekdays: 'Chọn ít nhất một thứ.' })
    expect(validate(custom({ freq: 'DAILY', byWeekdays: [] }))).toEqual({})
    expect(validate(custom({ end: 'UNTIL', untilDate: '' }))).toEqual({ end: 'Chọn ngày kết thúc.' })
    expect(validate(custom({ end: 'UNTIL', untilDate: '2026-10-04' }))).toEqual({ end: 'Ngày kết thúc không được trước hạn.' })
    expect(validate(custom({ end: 'UNTIL', untilDate: '2026-10-05' }))).toEqual({})
    expect(validate(custom({ end: 'COUNT', count: 0 }))).toEqual({ end: 'Nhập một số từ 1 đến 999.' })
    expect(validate(custom({ end: 'COUNT', count: 1000 }))).toEqual({ end: 'Nhập một số từ 1 đến 999.' })
    expect(validate(values({ repeat: 'WEEKLY', custom: { ...values({}).custom, interval: 0, byWeekdays: [] } }))).toEqual({})
  })
})

describe('where a refusal of the server shows', () => {
  const FAILED = { form: 'Không lưu được việc. Hãy thử lại.' }

  it('puts a rule that does not fit the due next to the repeat', () => {
    expect(errorsOf(new ApiError(422, 'INVALID_RECURRENCE', 'The weekdays…'))).toEqual({ repeat: 'Lặp lại không khớp với ngày hạn.' })
  })

  it('puts each refused field of a 400 next to its box', () => {
    const refused = (...fields: string[]) =>
      errorsOf(new ApiError(400, 'VALIDATION_FAILED', null, fields.map((field) => ({ field, message: 'in English' }))))

    expect(refused('title', 'notes')).toEqual({ title: 'Tiêu đề không hợp lệ.', notes: 'Ghi chú không hợp lệ.' })
    expect(refused('titleNotBlankWhenGiven')).toEqual({ title: 'Tiêu đề không hợp lệ.' })
    expect(refused('dueAt', 'oneDueAtMost')).toEqual({ date: 'Hạn không hợp lệ.' })
    expect(refused('recurrence.interval', 'repeatingWithADue')).toEqual({ repeat: 'Lặp lại không hợp lệ.' })
    expect(refused('somethingElse')).toEqual(FAILED)
    expect(refused()).toEqual(FAILED)
  })

  it('says the save failed for anything else', () => {
    expect(errorsOf(new ApiError(500, 'INTERNAL_ERROR', null))).toEqual(FAILED)
    expect(errorsOf(new ApiError(409, 'CONCURRENT_MODIFICATION', null))).toEqual(FAILED)
    expect(errorsOf(new Error('boom'))).toEqual(FAILED)
  })
})
