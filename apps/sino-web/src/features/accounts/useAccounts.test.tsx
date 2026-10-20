import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { SHELL_QUERY_KEY } from '@/app/shell/useShellData'
import { createOverviewSample } from '@/features/overview/overview.sample'
import type { OverviewData } from '@/features/overview/overview.types'
import { OVERVIEW_QUERY_KEY } from '@/features/overview/useOverview'
import { accountsWithStatus } from '@/test/accountsWithStatus'
import { fetchAccounts, saveChannel } from './accounts.api'
import { createAccountExtrasSample, createAccountsSample } from './accounts.sample'
import type { AccountsData } from './accounts.types'
import type { InitialSyncState } from './connect.types'
import {
  ACCOUNTS_QUERY_KEY,
  useAccount,
  useAccounts,
  useAccountCounts,
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

describe('first imports in the list (FE-52)', () => {
  it('asks the list again while a first import runs, and reads the inbox again once it is done', async () => {
    const withImport = (state: InitialSyncState): AccountsData => {
      const data = createAccountsSample(now)
      const firstImport = { state, range: 'DAYS_90', fetched: 412, total: 1180, remainingMinutes: 3, storedMessages: 412, errorCode: null } as const
      return { ...data, accounts: data.accounts.map((account) => (account.id === 'acc-gmail' ? { ...account, firstImport } : account)) }
    }
    vi.mocked(fetchAccounts).mockResolvedValueOnce(withImport('RUNNING')).mockResolvedValueOnce(withImport('DONE'))
    const { queryClient, wrapper } = setup({ list: false })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useAccounts(), { wrapper })
    const gmailImport = () => result.current.list?.accounts.find((account) => account.id === 'acc-gmail')?.firstImport?.state

    await waitFor(() => expect(gmailImport()).toBe('RUNNING'))
    expect(invalidate).not.toHaveBeenCalled()

    await waitFor(() => expect(gmailImport()).toBe('DONE'), { timeout: 4000 })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inbox'] })
  })
})

describe('account counts (NS-01, NS-03, D-321, D-326)', () => {
  it('are not known until the list has come', async () => {
    const { wrapper } = setup({ list: false })
    const { result } = renderHook(() => useAccountCounts(), { wrapper })

    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toEqual({ total: 3, needingAction: 1 }))
  })

  it('count the accounts, and of them those the owner has to act on: signed out or failing, not degraded, off or well', () => {
    const { queryClient, wrapper } = setup({ list: false })
    queryClient.setQueryData(
      ACCOUNTS_QUERY_KEY,
      accountsWithStatus('AUTH_EXPIRED', 'ERROR', 'DEGRADED', 'DISABLED', 'CONNECTED', 'AUTH_EXPIRED'),
    )

    const { result } = renderHook(() => useAccountCounts(), { wrapper })

    expect(result.current).toEqual({ total: 6, needingAction: 3 })
  })

  it('are zero when no account needs action, and when there is no account at all', async () => {
    const { queryClient, wrapper } = setup({ list: false })
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('CONNECTED', 'DEGRADED'))
    const { result } = renderHook(() => useAccountCounts(), { wrapper })
    expect(result.current).toEqual({ total: 2, needingAction: 0 })

    act(() => queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('AUTH_EXPIRED')))
    await waitFor(() => expect(result.current).toEqual({ total: 1, needingAction: 1 }))
    act(() => queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus()))

    await waitFor(() => expect(result.current).toEqual({ total: 0, needingAction: 0 }))
  })

  it('follow the list as an account is signed out and signed in again', async () => {
    const { queryClient, wrapper } = setup({ list: false })
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('CONNECTED', 'CONNECTED'))
    const { result } = renderHook(() => useAccountCounts(), { wrapper })

    act(() => queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('CONNECTED', 'AUTH_EXPIRED')))
    await waitFor(() => expect(result.current?.needingAction).toBe(1))

    act(() => queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('CONNECTED', 'CONNECTED')))
    await waitFor(() => expect(result.current?.needingAction).toBe(0))
  })

  it('read the list without the first-import duties of useAccounts: no inbox read again at every start of the app', () => {
    const data = createAccountsSample(now)
    const withDoneImport = {
      ...data,
      accounts: data.accounts.map((account) => ({
        ...account,
        firstImport: { state: 'DONE', range: 'DAYS_90', fetched: 10, total: 10, remainingMinutes: 0, storedMessages: 10, errorCode: null } as const,
      })),
    }
    const { queryClient, wrapper } = setup({ list: false })
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, withDoneImport)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => useAccountCounts(), { wrapper })

    expect(invalidate).not.toHaveBeenCalled()
  })

  it('keep the same object while the list changes but the counts do not', () => {
    const { queryClient, wrapper } = setup({ list: false })
    const list = accountsWithStatus('CONNECTED', 'AUTH_EXPIRED')
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, list)
    const { result } = renderHook(() => useAccountCounts(), { wrapper })
    const before = result.current

    // A channel switched: the list is another one, the counts are the same.
    act(() => queryClient.setQueryData(ACCOUNTS_QUERY_KEY, withChannel(list, 'acc-0', 'SEND', false)))

    expect(queryClient.getQueryData(ACCOUNTS_QUERY_KEY)).not.toBe(list)
    expect(result.current).toBe(before)
  })
})

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

  it('disconnecting updates the list and the overview, and leaves the shell cache alone (the count comes from the list, D-326)', async () => {
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(['accounts', 'acc-messenger', 'extras'], createAccountExtrasSample('acc-messenger', now))
    const shellBefore = queryClient.getQueryData(SHELL_QUERY_KEY)
    const { result } = renderHook(() => useDisconnectAccount(), { wrapper })
    await act(() => result.current.mutateAsync({ accountId: 'acc-messenger' }))
    expect(queryClient.getQueryData(['accounts', 'acc-messenger', 'extras'])).toBeUndefined()
    expect(queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)!.accounts).toHaveLength(2)
    expect(queryClient.getQueryData(SHELL_QUERY_KEY)).toEqual(shellBefore)
    const overview = queryClient.getQueryData<OverviewData>(OVERVIEW_QUERY_KEY)!
    expect(overview.accounts.map((account) => account.id)).toEqual(['acc-gmail', 'acc-zalo'])
  })

  it('disconnecting creates no overview when there is none', async () => {
    const { queryClient, wrapper } = setup({ overview: false })
    const { result } = renderHook(() => useDisconnectAccount(), { wrapper })
    await act(() => result.current.mutateAsync({ accountId: 'acc-gmail' }))
    expect(queryClient.getQueryData(OVERVIEW_QUERY_KEY)).toBeUndefined()
  })
})
