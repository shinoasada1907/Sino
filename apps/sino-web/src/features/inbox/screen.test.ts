import { describe, expect, it } from 'vitest'
import { createInboxSample } from './inbox.sample'
import { kindOfProvider, screenFrame } from './screen'

const NOW = new Date('2026-10-02T07:05:00Z')

describe('the screen of a provider (f05c)', () => {
  it('counts a provider missing from the catalog as email, as the backend does (D-308)', () => {
    const { providers } = createInboxSample(NOW)

    expect(kindOfProvider(providers, 'zalo')).toBe('CHAT')
    expect(kindOfProvider(providers, 'gmail')).toBe('EMAIL')
    expect(kindOfProvider([], 'zalo')).toBe('EMAIL')
  })

  it('shows an account of a provider missing from the catalog on Hộp thư only', () => {
    const sample = createInboxSample(NOW)
    const unknown = { ...sample.accounts[0], id: 'acc-new', provider: 'telegram' }
    const inbox = { ...sample, accounts: [...sample.accounts, unknown] }

    expect(screenFrame(inbox, 'EMAIL').accounts.map((account) => account.id)).toContain('acc-new')
    expect(screenFrame(inbox, 'CHAT').accounts.map((account) => account.id)).not.toContain('acc-new')
  })
})
