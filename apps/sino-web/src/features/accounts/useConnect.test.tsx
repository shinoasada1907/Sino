import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw/server'
import { leaveTo, startConnect } from './accounts.api'
import { createAccountsSample } from './accounts.sample'
import type { AccountsData } from './accounts.types'
import { createConnectProvidersSample } from './connect.sample'
import { useConnectProviders, useInitialSync, useStartConnect, useStartInitialSync, useSyncEstimate } from './useConnect'
import { ACCOUNTS_QUERY_KEY } from './useAccounts'

// The wizard on the full contract of fe-ui-connect (sample providers with scopes, the sample round trip); the API path
// is tested in ConnectOnApi.test.tsx.
vi.mock('./accounts.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./accounts.api')>()
  const { createConnectProvidersSample } = await import('./connect.sample')
  return {
    ...api,
    fetchConnectProviders: vi.fn(async () => createConnectProvidersSample()),
    startConnect: vi.fn(async (_provider: string, accountId: string | null) => ({ authorizationUrl: `/accounts?connected=${accountId ?? 'acc-gmail'}` })),
    leaveTo: vi.fn(),
  }
})

const now = new Date('2026-10-02T07:05:00Z')

// `GET /api/accounts/{id}/initial-sync` of BE-45.
const RUNNING = {
  status: 'RUNNING',
  range: 'DAYS_90',
  imported: 412,
  skipped: 0,
  estimated: 1180,
  remainingMinutes: 3,
  storedMessages: 412,
  startedAt: '2026-10-02T07:05:00Z',
  finishedAt: null,
  errorCode: null,
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData(ACCOUNTS_QUERY_KEY, createAccountsSample(now))
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

describe('connect sample data', () => {
  it('lets only Gmail be connected, with scopes the wizard can explain', async () => {
    const { scopePurpose } = await import('./connect.format')
    const providers = createConnectProvidersSample()
    expect(providers.map((provider) => provider.type)).toEqual(['gmail', 'zalo', 'messenger', 'google', 'telegram'])
    expect(providers.filter((provider) => provider.connectable).map((provider) => provider.type)).toEqual(['gmail'])
    const gmail = providers[0]
    expect(gmail.scopes).toEqual(['gmail.readonly', 'userinfo.email'])
    expect((gmail.scopes ?? []).every((scope) => scopePurpose(scope) !== null)).toBe(true)
  })
})

describe('connect hooks', () => {
  it('lists the providers of the wizard', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useConnectProviders(), { wrapper })
    await waitFor(() => expect(result.current.providers).toHaveLength(5))
  })

  it('starts a connect and leaves for the address it gets back', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useStartConnect(), { wrapper })

    await act(() => result.current.mutateAsync({ provider: 'messenger', accountId: 'acc-messenger' }))

    expect(startConnect).toHaveBeenCalledWith('messenger', 'acc-messenger')
    expect(leaveTo).toHaveBeenCalledWith('/accounts?connected=acc-messenger')
  })

  it('a new connect goes back to the sample Gmail account', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useStartConnect(), { wrapper })

    await act(() => result.current.mutateAsync({ provider: 'gmail', accountId: null }))

    expect(startConnect).toHaveBeenCalledWith('gmail', null)
    expect(leaveTo).toHaveBeenCalledWith('/accounts?connected=acc-gmail')
  })

  it('estimates the range that is picked', async () => {
    server.use(
      http.get('/api/accounts/:id/initial-sync/estimate', ({ request }) =>
        HttpResponse.json(new URL(request.url).searchParams.get('range') === 'DAYS_30' ? { messages: 420, minMinutes: 1, maxMinutes: 2 } : { messages: 1180, minMinutes: 3, maxMinutes: 5 }),
      ),
    )
    const { wrapper } = setup()
    const { result, rerender } = renderHook(({ range }) => useSyncEstimate('acc-gmail', range), {
      wrapper,
      initialProps: { range: 'DAYS_90' as const } as { range: 'DAYS_90' | 'DAYS_30' },
    })
    await waitFor(() => expect(result.current.estimate?.messages).toBe(1180))
    rerender({ range: 'DAYS_30' })
    await waitFor(() => expect(result.current.estimate?.messages).toBe(420))
  })

  it('starting the first import returns its progress and shows it on the account', async () => {
    server.use(http.post('/api/accounts/:id/initial-sync', () => HttpResponse.json(RUNNING, { status: 202 })))
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useStartInitialSync(), { wrapper })

    let status
    await act(async () => {
      status = await result.current.mutateAsync({
        accountId: 'acc-gmail',
        options: { range: 'DAYS_90', labelsAsFilters: true, attachmentsOnOpen: true },
      })
    })

    expect(status).toEqual({ state: 'RUNNING', range: 'DAYS_90', fetched: 412, total: 1180, remainingMinutes: 3, storedMessages: 412, errorCode: null })
    const accounts = queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)!.accounts
    expect(accounts.find((account) => account.id === 'acc-gmail')?.syncProgress).toBe(35)
    expect(accounts.find((account) => account.id === 'acc-zalo')?.syncProgress).toBe(64)
  })

  it('follows the import until it is done, then clears its share and reads the inbox again', async () => {
    server.use(http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json({ ...RUNNING, status: 'DONE', imported: 1180, remainingMinutes: null })))
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData<AccountsData>(ACCOUNTS_QUERY_KEY, (list) =>
      list && { ...list, accounts: list.accounts.map((account) => (account.id === 'acc-gmail' ? { ...account, syncProgress: 35 } : account)) },
    )
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useInitialSync('acc-gmail'), { wrapper })

    await waitFor(() => expect(result.current.status?.state).toBe('DONE'))
    const accounts = queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)!.accounts
    expect(accounts.find((account) => account.id === 'acc-gmail')?.syncProgress).toBeNull()
    expect(accounts.find((account) => account.id === 'acc-zalo')?.syncProgress).toBe(64)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inbox'] })
  })
})
