// Calendar days without a time ("2026-10-15"): the due day of an all-day task, the days of an all-day event.
import type { LocalDate } from '@/shared/domain'
import { localParts } from './local'

const DAY_MS = 86_400_000
const pad = (value: number) => String(value).padStart(2, '0')

// A day as midnight UTC, only to count and move days: no time zone takes part.
function utcOf(date: LocalDate): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function dateOfUtc(time: number): LocalDate {
  const value = new Date(time)
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
}

/** The day an instant falls on in the time zone (the browser's when none is given). */
export function localDateOf(date: Date, timeZone?: string): LocalDate {
  const { year, month, day } = localParts(date, timeZone)
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Days from `from` to `to`: negative when `to` is earlier. */
export function daysBetweenDates(from: LocalDate, to: LocalDate): number {
  return Math.round((utcOf(to) - utcOf(from)) / DAY_MS)
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return dateOfUtc(utcOf(date) + days * DAY_MS)
}

/** 0 = Sunday, as `WEEKDAY_NAMES`. */
export function weekdayOfDate(date: LocalDate): number {
  return new Date(utcOf(date)).getUTCDay()
}

/** "15/10" */
export function dayMonthOfDate(date: LocalDate): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}
