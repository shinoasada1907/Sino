import { describe, expect, it } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { createOverviewSample } from './overview.sample'

const now = new Date('2026-10-02T07:05:00Z')
const overview = createOverviewSample(now)
const shell = createShellSample(now)
const HOUR = 3_600_000

describe('overview sample data', () => {
  it('fills every section, so each card has something to show', () => {
    expect(overview.inbox).not.toBeNull()
    expect(overview.today).not.toBeNull()
    expect(overview.syncActivity).not.toBeNull()
    expect(overview.registrations).not.toBeNull()
    expect(overview.activity).not.toBeNull()
  })

  it('keeps its totals consistent', () => {
    const inbox = overview.inbox!
    expect(inbox.unreadCount).toBe(inbox.bySource.reduce((sum, source) => sum + source.unreadCount, 0))
    const registrations = overview.registrations!
    expect(registrations.total).toBe(registrations.byMethod.reduce((sum, method) => sum + method.count, 0))
  })

  it('agrees with the shell data shown in the navigation', () => {
    expect(shell.accountCount).toBe(overview.accounts.length)
    expect(shell.navCounts.inboxUnread).toBe(overview.inbox!.unreadCount)
    expect(shell.navCounts.accountsNeedingAction).toBe(
      overview.accounts.filter((account) => account.status === 'AUTH_EXPIRED' || account.status === 'ERROR').length,
    )
    expect(shell.navCounts.registrationsNew).toBe(overview.registrations!.latest?.isNew ? 1 : 0)
  })

  it('puts past events in the past and lists conversations newest first', () => {
    const times = overview.inbox!.conversations.map((conversation) => new Date(conversation.lastMessageAt).getTime())
    expect(times.every((time) => time < now.getTime())).toBe(true)
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    expect(overview.activity!.every((item) => new Date(item.at) < now)).toBe(true)
  })

  it('has 24 hourly buckets ending with the current hour', () => {
    const buckets = overview.syncActivity!.buckets
    expect(buckets).toHaveLength(24)
    const starts = buckets.map((bucket) => new Date(bucket.start).getTime())
    starts.slice(1).forEach((start, index) => expect(start - starts[index]).toBe(HOUR))
    const last = starts[starts.length - 1]
    expect(now.getTime() - last).toBeGreaterThanOrEqual(0)
    expect(now.getTime() - last).toBeLessThan(HOUR)
  })

  it('moves with the clock, so it looks current whenever it is opened', () => {
    const later = createOverviewSample(new Date(now.getTime() + 5 * HOUR))
    const shift = (iso: string, base: string) => new Date(iso).getTime() - new Date(base).getTime()
    expect(shift(later.inbox!.conversations[0].lastMessageAt, overview.inbox!.conversations[0].lastMessageAt)).toBe(5 * HOUR)
  })
})
