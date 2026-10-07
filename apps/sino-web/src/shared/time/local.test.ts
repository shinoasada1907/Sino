import { describe, expect, it } from 'vitest'
import {
  calendarDaysBetween,
  formatClock,
  formatDateLine,
  formatDayMonth,
  formatIn,
  formatWhen,
  weekdayName,
} from './local'

const TZ = 'Asia/Ho_Chi_Minh'
// Friday 2 October 2026, 14:05 in Vietnam.
const now = new Date('2026-10-02T07:05:00Z')
const at = (iso: string) => new Date(iso)

describe('local time', () => {
  it('formats a clock time and a day/month in the given time zone', () => {
    expect(formatClock(at('2026-10-02T02:41:00Z'), TZ)).toBe('09:41')
    expect(formatClock(at('2026-10-01T17:30:00Z'), TZ)).toBe('00:30')
    expect(formatDayMonth(at('2026-09-30T03:00:00Z'), TZ)).toBe('30/09')
  })

  it('names the weekday in Vietnamese', () => {
    expect(weekdayName(now, TZ)).toBe('Thứ Sáu')
    expect(weekdayName(at('2026-10-04T03:00:00Z'), TZ)).toBe('Chủ nhật')
  })

  it('writes the date line of the overview header', () => {
    expect(formatDateLine(now, TZ)).toBe('THỨ SÁU · 02/10/2026 · 14:05')
    expect(formatDateLine(now, TZ, { year: false })).toBe('THỨ SÁU · 02/10 · 14:05')
  })

  it('counts calendar days in the time zone, not 24-hour blocks', () => {
    // 23:30 on 1 October and 00:30 on 2 October are an hour apart but on different days.
    expect(calendarDaysBetween(at('2026-10-01T16:30:00Z'), at('2026-10-01T17:30:00Z'), TZ)).toBe(1)
    expect(calendarDaysBetween(at('2026-09-30T03:00:00Z'), now, TZ)).toBe(2)
    expect(calendarDaysBetween(now, now, TZ)).toBe(0)
  })

  it('says when a message came: the time today, "Hôm qua", then the date', () => {
    expect(formatWhen(at('2026-10-02T02:41:00Z'), now, TZ)).toBe('09:41')
    expect(formatWhen(at('2026-10-01T14:00:00Z'), now, TZ)).toBe('Hôm qua')
    expect(formatWhen(at('2026-09-30T16:59:00Z'), now, TZ)).toBe('30/09')
    expect(formatWhen(at('2026-09-29T03:00:00Z'), now, TZ)).toBe('29/09')
  })

  it('says how long until something starts', () => {
    expect(formatIn(at('2026-10-02T07:20:00Z'), now)).toBe('sau 15 phút')
    expect(formatIn(at('2026-10-02T09:00:00Z'), now)).toBe('sau 2 giờ')
    expect(formatIn(at('2026-10-04T07:05:00Z'), now)).toBe('sau 2 ngày')
    expect(formatIn(at('2026-10-02T07:00:00Z'), now)).toBe('đang diễn ra')
  })
})
