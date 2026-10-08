import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { server } from '@/test/msw/server'
import { deleteAccount, fetchAccountExtras, fetchAccounts, saveChannel } from './accounts.api'

describe('the Tài khoản requests on the backend API (D-56)', () => {
  it('turns the accounts and providers of the API into the screen contract, with null for what the API lacks', async () => {
    server.use(
      http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    )

    const data = await fetchAccounts()

    expect(data.providers).toEqual([{ type: 'gmail', displayName: 'Gmail' }])
    expect(data.storedMessages).toBeNull()
    expect(Date.parse(data.generatedAt)).not.toBeNaN()
    expect(data.accounts).toEqual([
      {
        id: 'acc-1',
        provider: 'gmail',
        externalAccountId: 'an.nguyen@gmail.com',
        displayName: 'An Nguyễn',
        avatarUrl: null,
        status: 'CONNECTED',
        syncEnabled: true,
        lastSyncedAt: '2026-10-02T07:03:00Z',
        createdAt: '2026-09-29T13:05:00Z',
        syncProgress: null,
        statusChangedAt: null,
        access: null,
        storedMessages: null,
        syncIntervalMinutes: null,
        channels: [{ kind: 'INBOUND', available: true, enabled: true }],
      },
      expect.objectContaining({
        id: 'acc-2',
        status: 'AUTH_EXPIRED',
        channels: [{ kind: 'INBOUND', available: false, enabled: false }],
      }),
    ])
  })

  it('has no detail sections yet, and does not ask for them', async () => {
    expect(await fetchAccountExtras('acc-1')).toEqual({ scopes: null, sites: null, syncRuns: null, activity: null })
  })

  it('turns the inbound channel on and off through automatic sync', async () => {
    let body: unknown = null
    server.use(
      http.patch('/api/accounts/acc-1', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...API_ACCOUNTS[0], syncEnabled: false })
      }),
    )

    await saveChannel({ accountId: 'acc-1', kind: 'INBOUND', enabled: false })

    expect(body).toEqual({ syncEnabled: false })
    await expect(saveChannel({ accountId: 'acc-1', kind: 'SEND', enabled: true })).rejects.toThrow()
  })

  it('removes an account', async () => {
    let removed = ''
    server.use(
      http.delete('/api/accounts/:id', ({ params }) => {
        removed = String(params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await deleteAccount({ accountId: 'acc-2' })

    expect(removed).toBe('acc-2')
  })
})
