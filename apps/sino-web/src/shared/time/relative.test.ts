import { describe, expect, it } from 'vitest'
import { formatAgo } from './relative'

const now = new Date('2026-10-02T07:05:00Z')
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

describe('formatAgo', () => {
  it('says "vừa xong" for less than a minute', () => {
    expect(formatAgo(minutesAgo(0.5), now)).toBe('vừa xong')
  })

  it('counts minutes below an hour', () => {
    expect(formatAgo(minutesAgo(2), now)).toBe('2 phút trước')
    expect(formatAgo(minutesAgo(59), now)).toBe('59 phút trước')
  })

  it('counts hours below a day', () => {
    expect(formatAgo(minutesAgo(60), now)).toBe('1 giờ trước')
    expect(formatAgo(minutesAgo(23 * 60 + 59), now)).toBe('23 giờ trước')
  })

  it('counts days from 24 hours on', () => {
    expect(formatAgo(minutesAgo(26 * 60), now)).toBe('1 ngày trước')
  })

  it('treats a time in the future (clock skew) as "vừa xong"', () => {
    expect(formatAgo(minutesAgo(-3), now)).toBe('vừa xong')
  })
})
