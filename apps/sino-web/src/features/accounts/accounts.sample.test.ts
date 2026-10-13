import { describe, expect, it } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { createOverviewSample } from '@/features/overview/overview.sample'
import { createAccountExtrasSample, createAccountsSample } from './accounts.sample'
import { needsAttention } from './format'

const now = new Date('2026-10-02T07:05:00Z')
const list = createAccountsSample(now)
const HOUR = 3_600_000

describe('accounts sample data', () => {
  it('stores as many messages in total as all accounts together', () => {
    expect(list.storedMessages).toBe(3912)
    expect(list.storedMessages).toBe(list.accounts.reduce((sum, account) => sum + (account.storedMessages ?? 0), 0))
  })

  it('agrees with the shell and the overview', () => {
    const shell = createShellSample(now)
    expect(shell.accountCount).toBe(list.accounts.length)
    expect(shell.navCounts.accountsNeedingAction).toBe(list.accounts.filter(needsAttention).length)
    const pick = ({ id, provider, externalAccountId, status }: { id: string; provider: string; externalAccountId: string; status: string }) => ({
      id,
      provider,
      externalAccountId,
      status,
    })
    expect(list.accounts.map(pick)).toEqual(createOverviewSample(now).accounts.map(pick))
  })

  it('only turns on channels that are available', () => {
    const channels = list.accounts.flatMap((account) => account.channels)
    expect(channels.filter((channel) => channel.enabled && !channel.available)).toEqual([])
  })

  it('gives Gmail every detail section, with times in the past and runs newest first', () => {
    const gmail = list.accounts.find((account) => account.id === 'acc-gmail')!
    const extras = createAccountExtrasSample('acc-gmail', now)
    expect(extras.sites!.total).toBeGreaterThanOrEqual(extras.sites!.items.length)
    const runs = extras.syncRuns!.map((run) => new Date(run.at).getTime())
    expect([...runs].sort((a, b) => b - a)).toEqual(runs)
    expect(runs[0]).toBe(new Date(gmail.lastSyncedAt!).getTime())
    expect(extras.activity!.every((item) => new Date(item.at) < now)).toBe(true)
    expect(extras.scopes!.filter((scope) => scope.granted)).toHaveLength(3)
  })

  it('leaves the detail sections of an account the backend knows little about empty', () => {
    expect(createAccountExtrasSample('acc-zalo', now)).toEqual({ scopes: null, sites: null, syncRuns: null, activity: null })
  })

  it('moves with the clock, so it looks current whenever it is opened', () => {
    const later = createAccountsSample(new Date(now.getTime() + 5 * HOUR))
    const shift = later.accounts.map((account, index) => Date.parse(account.createdAt) - Date.parse(list.accounts[index].createdAt))
    expect(shift).toEqual([5 * HOUR, 5 * HOUR, 5 * HOUR])
  })
})
