import { describe, expect, it } from 'vitest'
import { addDays, addMonths, dayMonthOfDate, daysBetweenDates, localDateOf, weekdayOfDate } from './localDate'

const TZ = 'Asia/Ho_Chi_Minh'

describe('calendar days without a time', () => {
  it('takes the day of an instant in the time zone', () => {
    expect(localDateOf(new Date('2026-10-01T17:30:00Z'), TZ)).toBe('2026-10-02')
    expect(localDateOf(new Date('2026-10-01T16:59:00Z'), TZ)).toBe('2026-10-01')
  })

  it('counts the days between two days, across months', () => {
    expect(daysBetweenDates('2026-09-30', '2026-10-02')).toBe(2)
    expect(daysBetweenDates('2026-10-02', '2026-09-30')).toBe(-2)
    expect(daysBetweenDates('2026-10-02', '2026-10-02')).toBe(0)
  })

  it('moves by days across the end of a month and a year', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('moves by months, keeping the day or taking the last day of a shorter month', () => {
    expect(addMonths('2026-10-31', 1)).toBe('2026-11-30')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
  })

  it('names the weekday and the day and month', () => {
    expect(weekdayOfDate('2026-10-02')).toBe(5)
    expect(weekdayOfDate('2026-10-04')).toBe(0)
    expect(dayMonthOfDate('2026-10-15')).toBe('15/10')
  })
})
