import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { leaveTo, startConnect } from './accounts.api'
import { createAccountsSample } from './accounts.sample'
import type { AccountsData } from './accounts.types'
import { createConnectProvidersSample, createInitialSyncSample, createSyncEstimateSample } from './connect.sample'
import { useConnectProviders, useStartConnect, useStartInitialSync, useSyncEstimate } from './useConnect'
import { ACCOUNTS_QUERY_KEY } from './useAccounts'

vi.mock('./accounts.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./accounts.api')>()
  return { ...api, startConnect: vi.fn(api.startConnect), leaveTo: vi.fn() }
})

const now = new Date('2026-10-02T07:05:00Z')

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
    expect(gmail.scopes.every((scope) => scopePurpose(scope) !== null)).toBe(true)
  })

  it('estimates each range and starts the first sync with the same total', () => {
    expect(createSyncEstimateSample('DAYS_90')).toEqual({ messages: 1180, minMinutes: 3, maxMinutes: 5 })
    expect(createSyncEstimateSample('DAYS_30')).toEqual({ messages: 420, minMinutes: 1, maxMinutes: 2 })
    for (const range of ['DAYS_30', 'DAYS_90', 'ALL'] as const) {
      expect(createInitialSyncSample(range).total).toBe(createSyncEstimateSample(range)?.messages)
    }
    expect(createInitialSyncSample('DAYS_90')).toEqual({ fetched: 412, total: 1180, remainingMinutes: 3 })
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
    const { wrapper } = setup()
    const { result, rerender } = renderHook(({ range }) => useSyncEstimate('acc-gmail', range), {
      wrapper,
      initialProps: { range: 'DAYS_90' as const } as { range: 'DAYS_90' | 'DAYS_30' },
    })
    await waitFor(() => expect(result.current.estimate?.messages).toBe(1180))
    rerender({ range: 'DAYS_30' })
    await waitFor(() => expect(result.current.estimate?.messages).toBe(420))
  })

  it('starting the first sync returns its progress and shows it on the account', async () => {
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useStartInitialSync(), { wrapper })

    let status
    await act(async () => {
      status = await result.current.mutateAsync({
        accountId: 'acc-gmail',
        options: { range: 'DAYS_90', labelsAsFilters: true, attachmentsOnOpen: true },
      })
    })

    expect(status).toEqual({ fetched: 412, total: 1180, remainingMinutes: 3 })
    const accounts = queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)!.accounts
    expect(accounts.find((account) => account.id === 'acc-gmail')?.syncProgress).toBe(35)
    expect(accounts.find((account) => account.id === 'acc-zalo')?.syncProgress).toBe(64)

    await act(async () => {
      status = await result.current.mutateAsync({
        accountId: 'acc-gmail',
        options: { range: 'DAYS_30', labelsAsFilters: false, attachmentsOnOpen: false },
      })
    })
    expect(status).toEqual({ fetched: 147, total: 420, remainingMinutes: 1 })
  })
})
