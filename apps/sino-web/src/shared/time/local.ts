// Dates as the user reads them: in a time zone (the browser's when none is given), in Vietnamese.

interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** 0 = Sunday. */
  weekday: number
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? ''
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
    formatters.set(key, formatter)
  }
  return formatter
}

export function localParts(date: Date, timeZone?: string): LocalParts {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday],
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** "09:41" */
export function formatClock(date: Date, timeZone?: string): string {
  const { hour, minute } = localParts(date, timeZone)
  return `${pad(hour)}:${pad(minute)}`
}

/** "30/09" */
export function formatDayMonth(date: Date, timeZone?: string): string {
  const { day, month } = localParts(date, timeZone)
  return `${pad(day)}/${pad(month)}`
}

/** "Thứ Sáu", "Chủ nhật" */
export function weekdayName(date: Date, timeZone?: string): string {
  return WEEKDAY_NAMES[localParts(date, timeZone).weekday]
}

/** "THỨ SÁU · 02/10/2026 · 14:05", or without the year. */
export function formatDateLine(date: Date, timeZone?: string, { year = true }: { year?: boolean } = {}): string {
  const parts = localParts(date, timeZone)
  const day = `${pad(parts.day)}/${pad(parts.month)}${year ? `/${parts.year}` : ''}`
  return `${weekdayName(date, timeZone).toUpperCase()} · ${day} · ${pad(parts.hour)}:${pad(parts.minute)}`
}

/** Calendar days from `from` to `to` in the time zone: 23:30 and 00:30 the next day are 1 day apart. */
export function calendarDaysBetween(from: Date, to: Date, timeZone?: string): number {
  const a = localParts(from, timeZone)
  const b = localParts(to, timeZone)
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000)
}

/** When something happened: the time today, "Hôm qua", or the date. */
export function formatWhen(date: Date, now: Date, timeZone?: string): string {
  const days = calendarDaysBetween(date, now, timeZone)
  if (days <= 0) {
    return formatClock(date, timeZone)
  }
  return days === 1 ? 'Hôm qua' : formatDayMonth(date, timeZone)
}

/** How long until something starts: "sau 15 phút", "sau 2 giờ", "sau 2 ngày". */
export function formatIn(date: Date, now: Date): string {
  const ms = date.getTime() - now.getTime()
  if (ms <= 0) {
    return 'đang diễn ra'
  }
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) {
    return `sau ${minutes} phút`
  }
  const hours = Math.round(ms / 3_600_000)
  if (hours < 24) {
    return `sau ${hours} giờ`
  }
  return `sau ${Math.round(ms / 86_400_000)} ngày`
}
