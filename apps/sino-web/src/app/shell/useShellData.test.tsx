import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createAccountsSample } from '@/features/accounts/accounts.sample'
import { ACCOUNTS_QUERY_KEY } from '@/features/accounts/useAccounts'
import type { Me } from '@/features/auth/auth.api'
import { ME_QUERY_KEY } from '@/features/auth/useAuth'
import { accountsWithStatus } from '@/test/accountsWithStatus'
import { useShellData } from './useShellData'

// A test without a list in the cache is a list that has not come: the request never answers.
vi.mock('@/features/accounts/accounts.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/accounts/accounts.api')>()),
  fetchAccounts: vi.fn(() => new Promise(() => undefined)),
}))

const OWNER: Me = { email: 'an.nguyen@gmail.com', displayName: 'An Nguyễn', avatarUrl: null }

function setup({ me = OWNER, list = true }: { me?: Me | null; list?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(ME_QUERY_KEY, me)
  if (list) {
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, createAccountsSample(new Date()))
  }
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

describe('what the app can say of itself today (NS-02, D-325)', () => {
  it('flags no notification and no new registration: nothing can count them yet', () => {
    const { wrapper } = setup({ list: false })
    const { result } = renderHook(() => useShellData(), { wrapper })

    expect(result.current.shell?.unreadNotifications).toBe(0)
    expect(result.current.shell?.navCounts.registrationsNew).toBe(0)
  })

  it('takes the owner from the signed-in user, since the shell is derived from real data (messages-by-account)', () => {
    const { wrapper } = setup({ list: false })
    const { result } = renderHook(() => useShellData(), { wrapper })

    expect(result.current.shell?.owner).toEqual({ displayName: 'An Nguyễn', shortName: 'Nguyễn' })
  })

  it('falls back to the e-mail address, then to a generic name, when the user has no display name', () => {
    const noName = setup({ me: { email: 'bao.tran@gmail.com', displayName: '', avatarUrl: null }, list: false })
    const withEmail = renderHook(() => useShellData(), { wrapper: noName.wrapper })
    expect(withEmail.result.current.shell?.owner).toEqual({ displayName: 'bao.tran@gmail.com', shortName: 'bao.tran' })

    const nobody = setup({ me: null, list: false })
    const generic = renderHook(() => useShellData(), { wrapper: nobody.wrapper })
    expect(generic.result.current.shell?.owner).toEqual({ displayName: 'Người dùng Sino', shortName: null })
  })

  it('says the sync is fine and dates it from the latest sync of any account', () => {
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('CONNECTED', 'CONNECTED'))
    const accounts = queryClient.getQueryData<ReturnType<typeof createAccountsSample>>(ACCOUNTS_QUERY_KEY)?.accounts ?? []
    const latest = accounts.map((account) => account.lastSyncedAt).filter((at): at is string => Boolean(at)).sort().pop() ?? null

    const { result } = renderHook(() => useShellData(), { wrapper })

    expect(result.current.shell?.sync).toEqual({ state: 'OK', lastSyncedAt: latest, progress: null })
  })
})

describe('the account counts of the shell (NS-01, NS-03, D-321, D-326)', () => {
  it('come from the account list', () => {
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('AUTH_EXPIRED', 'ERROR', 'CONNECTED', 'DISABLED'))

    const { result } = renderHook(() => useShellData(), { wrapper })

    expect(result.current.shell?.accountCount).toBe(4)
    expect(result.current.shell?.navCounts.accountsNeedingAction).toBe(2)
  })

  it('are not said before the list has come: no total, none needing action', () => {
    const { wrapper } = setup({ list: false })
    const { result } = renderHook(() => useShellData(), { wrapper })

    expect(result.current.shell?.accountCount).toBeNull()
    expect(result.current.shell?.navCounts.accountsNeedingAction).toBe(0)
  })

  it('follow the list as an account is added and signs out', async () => {
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('CONNECTED'))
    const { result } = renderHook(() => useShellData(), { wrapper })
    expect(result.current.shell?.accountCount).toBe(1)

    act(() => queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('CONNECTED', 'AUTH_EXPIRED')))

    await waitFor(() => expect(result.current.shell?.accountCount).toBe(2))
    expect(result.current.shell?.navCounts.accountsNeedingAction).toBe(1)
  })

  it('leave the counts of mail, chat and tasks to the shell, which reads them from their own data', () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useShellData(), { wrapper })

    expect(result.current.shell?.navCounts).toMatchObject({ messagesUnread: null, inboxUnread: 0, tasksDue: 0, tasksOverdue: 0 })
  })
})
