import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import type { ShellData } from '@/app/shell/shell.types'
import { SHELL_QUERY_KEY } from '@/app/shell/useShellData'
import { createOverviewSample } from '@/features/overview/overview.sample'
import type { OverviewData } from '@/features/overview/overview.types'
import { OVERVIEW_QUERY_KEY } from '@/features/overview/useOverview'
import { saveChannel } from './accounts.api'
import { createAccountExtrasSample, createAccountsSample } from './accounts.sample'
import type { AccountsData } from './accounts.types'
import {
  ACCOUNTS_QUERY_KEY,
  useAccount,
  useDisconnectAccount,
  useSetChannel,
  withChannel,
  withoutAccount,
} from './useAccounts'

vi.mock('./accounts.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./accounts.api')>()
  return {
    ...api,
    fetchAccounts: vi.fn(async () => createAccountsSample(new Date())),
    fetchAccountExtras: vi.fn(async (accountId: string) => createAccountExtrasSample(accountId, new Date())),
    saveChannel: vi.fn(async () => undefined),
    deleteAccount: vi.fn(async () => undefined),
  }
})

const now = new Date('2026-10-02T07:05:00Z')

function setup({ overview = true, list = true }: { overview?: boolean; list?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  if (list) {
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, createAccountsSample(now))
  }
  queryClient.setQueryData(SHELL_QUERY_KEY, createShellSample(now))
  if (overview) {
    queryClient.setQueryData(OVERVIEW_QUERY_KEY, createOverviewSample(now))
  }
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

const channelsOf = (data: AccountsData, id: string) => data.accounts.find((account) => account.id === id)!.channels

describe('cache updates', () => {
  it('turns one channel of one account on or off, leaving the input untouched', () => {
    const before = createAccountsSample(now)
    const after = withChannel(before, 'acc-gmail', 'INBOUND', false)
    expect(channelsOf(after, 'acc-gmail').map((channel) => channel.enabled)).toEqual([false, true, true, false])
    expect(channelsOf(after, 'acc-zalo')).toEqual(channelsOf(before, 'acc-zalo'))
    expect(channelsOf(before, 'acc-gmail')[0].enabled).toBe(true)
  })

  it('removes an account and keeps its stored messages in the total (deleting them waits for F05)', () => {
    const before = createAccountsSample(now)
    const after = withoutAccount(before, 'acc-messenger')
    expect(after.accounts.map((account) => account.id)).toEqual(['acc-gmail', 'acc-zalo'])
    expect(after.storedMessages).toBe(3912)
    expect(before.accounts).toHaveLength(3)
  })
})

describe('useAccount', () => {
  it('takes the account from the list and loads its detail sections', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useAccount('acc-gmail'), { wrapper })
    expect(result.current.account?.externalAccountId).toBe('an.nguyen@gmail.com')
    expect(result.current.notFound).toBe(false)
    await waitFor(() => expect(result.current.extras?.syncRuns).toHaveLength(5))
  })

  it('reports an unknown account as not found, without asking for its details', () => {
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useAccount('acc-nope'), { wrapper })
    expect(result.current.account).toBeUndefined()
    expect(result.current.notFound).toBe(true)
    expect(queryClient.getQueryState(['accounts', 'acc-nope', 'extras'])?.fetchStatus).toBe('idle')
  })

  it('does not call an account missing while the list is still loading', async () => {
    const { wrapper } = setup({ list: false })
    const { result } = renderHook(() => useAccount('acc-gmail'), { wrapper })
    expect(result.current.notFound).toBe(false)
    await waitFor(() => expect(result.current.account?.id).toBe('acc-gmail'))
  })
})

describe('mutations', () => {
  it('turning a channel off shows at once in the list', async () => {
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSetChannel(), { wrapper })
    await act(() => result.current.mutateAsync({ accountId: 'acc-gmail', kind: 'SEND', enabled: false }))
    expect(channelsOf(queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)!, 'acc-gmail')[1].enabled).toBe(false)
  })

  it('puts the switch back when saving fails', async () => {
    vi.mocked(saveChannel).mockRejectedValueOnce(new Error('offline'))
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSetChannel(), { wrapper })
    await act(() => result.current.mutateAsync({ accountId: 'acc-gmail', kind: 'SEND', enabled: false }).catch(() => undefined))
    expect(channelsOf(queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)!, 'acc-gmail')[1].enabled).toBe(true)
  })

  it('disconnecting updates the list, the shell counts and the overview', async () => {
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(['accounts', 'acc-messenger', 'extras'], createAccountExtrasSample('acc-messenger', now))
    const { result } = renderHook(() => useDisconnectAccount(), { wrapper })
    await act(() => result.current.mutateAsync({ accountId: 'acc-messenger' }))
    expect(queryClient.getQueryData(['accounts', 'acc-messenger', 'extras'])).toBeUndefined()
    expect(queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)!.accounts).toHaveLength(2)
    const shell = queryClient.getQueryData<ShellData>(SHELL_QUERY_KEY)!
    expect(shell.accountCount).toBe(2)
    expect(shell.navCounts.accountsNeedingAction).toBe(0)
    const overview = queryClient.getQueryData<OverviewData>(OVERVIEW_QUERY_KEY)!
    expect(overview.accounts.map((account) => account.id)).toEqual(['acc-gmail', 'acc-zalo'])
  })

  it('disconnecting an account that needs no action keeps the action count, and creates no overview', async () => {
    const { queryClient, wrapper } = setup({ overview: false })
    const { result } = renderHook(() => useDisconnectAccount(), { wrapper })
    await act(() => result.current.mutateAsync({ accountId: 'acc-gmail' }))
    expect(queryClient.getQueryData<ShellData>(SHELL_QUERY_KEY)!.navCounts.accountsNeedingAction).toBe(1)
    expect(queryClient.getQueryData(OVERVIEW_QUERY_KEY)).toBeUndefined()
  })
})
