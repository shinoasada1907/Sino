import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS, apiInitialSync } from '@/test/fixtures/accountsApi'
import { server } from '@/test/msw/server'
import {
  cancelQrConnect,
  deleteAccount,
  fetchAccountExtras,
  fetchAccounts,
  fetchConnectProviders,
  fetchInitialSync,
  fetchQrStatus,
  fetchSyncEstimate,
  saveChannel,
  startConnect,
  startInitialSync,
  startQrConnect,
} from './accounts.api'

describe('the Tài khoản requests on the backend API (D-56)', () => {
  it('turns the accounts and providers of the API into the screen contract, with null for what the API lacks', async () => {
    server.use(
      http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
      http.get('/api/accounts/:id/initial-sync', ({ params }) =>
        params.id === 'acc-1'
          ? HttpResponse.json(apiInitialSync({ status: 'RUNNING', imported: 412, remainingMinutes: 3, storedMessages: 412, finishedAt: null }))
          : HttpResponse.json({ title: 'Server error', status: 500, code: 'INTERNAL' }, { status: 500, headers: { 'Content-Type': 'application/problem+json' } }),
      ),
    )

    const data = await fetchAccounts()

    expect(data.providers).toEqual([{ type: 'gmail', displayName: 'Gmail', kind: 'EMAIL' }])
    expect(data.storedMessages).toBeNull()
    expect(Date.parse(data.generatedAt)).not.toBeNaN()
    expect(data.accounts).toEqual([
      {
        id: 'acc-1',
        provider: 'gmail',
        externalAccountId: '115758365451560723981',
        displayName: 'An Nguyễn',
        address: 'an.nguyen@gmail.com',
        avatarUrl: null,
        status: 'CONNECTED',
        syncEnabled: true,
        lastSyncedAt: '2026-10-02T07:03:00Z',
        createdAt: '2026-09-29T13:05:00Z',
        syncProgress: 35,
        statusChangedAt: null,
        access: null,
        storedMessages: 412,
        syncIntervalMinutes: null,
        channels: [{ kind: 'INBOUND', available: true, enabled: true }],
        firstImport: { state: 'RUNNING', range: 'DAYS_90', fetched: 412, total: 1180, remainingMinutes: 3, storedMessages: 412, errorCode: null },
      },
      // An import status that cannot be read does not fail the list.
      expect.objectContaining({
        id: 'acc-2',
        status: 'AUTH_EXPIRED',
        channels: [{ kind: 'INBOUND', available: false, enabled: false }],
        syncProgress: null,
        storedMessages: null,
        firstImport: null,
      }),
    ])
  })

  it('names an account by its address, or by its display name when the backend has none yet (BE-47)', async () => {
    server.use(
      http.get('/api/accounts', () => HttpResponse.json([{ ...API_ACCOUNTS[0], address: null, displayName: 'an.nguyen@gmail.com' }])),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
      http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(apiInitialSync())),
    )

    const [account] = (await fetchAccounts()).accounts

    expect(account.address).toBe('an.nguyen@gmail.com')
    expect(account.externalAccountId).toBe('115758365451560723981')
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

  it('lists the providers of the API as connectable, without the scopes it does not tell yet', async () => {
    server.use(http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)))

    expect(await fetchConnectProviders()).toEqual([
      {
        type: 'gmail',
        displayName: 'Gmail',
        kind: 'EMAIL',
        capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'],
        connectMethod: 'OAUTH2',
        connectable: true,
        scopes: null,
      },
    ])
  })

  // D-285, D-286: Zalo turned off is listed, says it connects by QR code, and cannot be connected; turned on, it can.
  it('takes from the API how each provider connects and whether it can be connected (ZL-11)', async () => {
    server.use(
      http.get('/api/providers', () =>
        HttpResponse.json([
          { ...API_PROVIDERS[0], connectMethod: 'OAUTH2', connectable: true },
          { type: 'zalo', displayName: 'Zalo', kind: 'CHAT', capabilities: ['READ_MESSAGES'], connectMethod: 'QR', connectable: true },
          { type: 'telegram', displayName: 'Telegram', kind: 'CHAT', capabilities: [], connectMethod: null, connectable: false },
        ]),
      ),
    )

    expect(await fetchConnectProviders()).toEqual([
      {
        type: 'gmail',
        displayName: 'Gmail',
        kind: 'EMAIL',
        capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'],
        connectMethod: 'OAUTH2',
        connectable: true,
        scopes: null,
      },
      { type: 'zalo', displayName: 'Zalo', kind: 'CHAT', capabilities: ['READ_MESSAGES'], connectMethod: 'QR', connectable: true, scopes: null },
      { type: 'telegram', displayName: 'Telegram', kind: 'CHAT', capabilities: [], connectMethod: 'OAUTH2', connectable: false, scopes: null },
    ])
  })

  it('starts, polls and cancels a QR connect (ZL-11)', async () => {
    const started: unknown[] = []
    let cancelled = ''
    server.use(
      http.post('/api/accounts/connect/:provider/qr', async ({ params, request }) => {
        started.push([params.provider, await request.json()])
        return HttpResponse.json({ loginId: 'login-1', qrImage: 'iVBORw0KGgo=', expiresAt: '2026-10-02T07:06:40Z' }, { status: 201 })
      }),
      http.get('/api/accounts/connect/:provider/qr/:loginId', ({ params }) =>
        HttpResponse.json({ state: 'SCANNED', displayName: `Nick ${params.provider} ${params.loginId}` }),
      ),
      http.delete('/api/accounts/connect/:provider/qr/:loginId', ({ params }) => {
        cancelled = `${params.provider}/${params.loginId}`
        return new HttpResponse(null, { status: 204 })
      }),
    )

    expect(await startQrConnect('zalo', null)).toEqual({ loginId: 'login-1', qrImage: 'iVBORw0KGgo=', expiresAt: '2026-10-02T07:06:40Z' })
    await startQrConnect('zalo', 'acc-zalo')
    expect(await fetchQrStatus('zalo', 'login-1')).toEqual({ state: 'SCANNED', displayName: 'Nick zalo login-1' })
    await cancelQrConnect('zalo', 'login-1')

    expect(started).toEqual([
      ['zalo', { acceptRisk: true }],
      ['zalo', { acceptRisk: true, accountId: 'acc-zalo' }],
    ])
    expect(cancelled).toBe('zalo/login-1')
  })

  it('starts a connect, or signs an account in again, and returns where to send the browser', async () => {
    const sent: unknown[] = []
    server.use(
      http.post('/api/accounts/connect/:provider', async ({ params, request }) => {
        const text = await request.text()
        sent.push([params.provider, text === '' ? null : JSON.parse(text)])
        return HttpResponse.json({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=s1' })
      }),
    )

    expect(await startConnect('gmail', null)).toEqual({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=s1' })
    await startConnect('gmail', 'acc-2')

    expect(sent).toEqual([
      ['gmail', null],
      ['gmail', { accountId: 'acc-2' }],
    ])
  })

  it('asks the estimate of a first import, and has none when the provider cannot tell (FE-51)', async () => {
    const asked: string[] = []
    server.use(
      http.get('/api/accounts/:id/initial-sync/estimate', ({ params, request }) => {
        const range = new URL(request.url).searchParams.get('range')
        asked.push(`${params.id} ${range}`)
        return HttpResponse.json(range === 'ALL' ? { messages: null, minMinutes: null, maxMinutes: null } : { messages: 1180, minMinutes: 3, maxMinutes: 5 })
      }),
    )

    expect(await fetchSyncEstimate('acc-1', 'DAYS_90')).toEqual({ messages: 1180, minMinutes: 3, maxMinutes: 5 })
    expect(await fetchSyncEstimate('acc-1', 'ALL')).toBeNull()
    expect(asked).toEqual(['acc-1 DAYS_90', 'acc-1 ALL'])
  })

  it('starts a first import with its range only, and reads its status in the words of the web (FE-51)', async () => {
    const status = {
      status: 'RUNNING',
      range: 'DAYS_30',
      imported: 147,
      skipped: 2,
      estimated: 420,
      remainingMinutes: 1,
      storedMessages: 150,
      startedAt: '2026-10-02T07:05:00Z',
      finishedAt: null,
      errorCode: null,
    }
    const sent: unknown[] = []
    server.use(
      http.post('/api/accounts/:id/initial-sync', async ({ params, request }) => {
        sent.push([params.id, await request.json()])
        return HttpResponse.json(status, { status: 202 })
      }),
      http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json({ ...status, status: 'FAILED', remainingMinutes: null, errorCode: 'RATE_LIMITED' })),
    )
    const web = { state: 'RUNNING', range: 'DAYS_30', fetched: 147, total: 420, remainingMinutes: 1, storedMessages: 150, errorCode: null }

    expect(await startInitialSync('acc-1', { range: 'DAYS_30', labelsAsFilters: true, attachmentsOnOpen: false })).toEqual(web)
    expect(sent).toEqual([['acc-1', { range: 'DAYS_30' }]])
    expect(await fetchInitialSync('acc-1')).toEqual({ ...web, state: 'FAILED', remainingMinutes: null, errorCode: 'RATE_LIMITED' })
  })
})
