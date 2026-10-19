import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createAccountsSample } from '@/features/accounts/accounts.sample'
import { ACCOUNTS_QUERY_KEY } from '@/features/accounts/useAccounts'
import { accountsWithStatus } from '@/test/accountsWithStatus'
import { CANVAS_NOW } from '@/shared/time/canvasClock'
import { createShellSample } from './shell.sample'
import { SHELL_QUERY_KEY, useShellData } from './useShellData'

// One fixed moment for the sample: a sample made at `new Date()` here and another made a millisecond later, to compare
// with, are two different samples (their `lastSyncedAt` differs), which failed the test now and then.
const AT_CANVAS = new Date(CANVAS_NOW)

// A test without a list in the cache is a list that has not come: the request never answers.
vi.mock('@/features/accounts/accounts.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/accounts/accounts.api')>()),
  fetchAccounts: vi.fn(() => new Promise(() => undefined)),
}))

function setup({ shell = true, list = true }: { shell?: boolean; list?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (shell) {
    queryClient.setQueryData(SHELL_QUERY_KEY, createShellSample(AT_CANVAS))
  }
  if (list) {
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, createAccountsSample(new Date()))
  }
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

describe('what the app can say of itself today (NS-02, D-325)', () => {
  it('flags no notification and no new registration: nothing can count them yet', async () => {
    const { wrapper } = setup({ shell: false, list: false })
    const { result } = renderHook(() => useShellData(), { wrapper })

    await waitFor(() => expect(result.current.shell).toBeDefined())

    expect(result.current.shell?.unreadNotifications).toBe(0)
    expect(result.current.shell?.navCounts.registrationsNew).toBe(0)
  })

  it('gives the sample only what is still sample: the owner and the sync line (D-42)', async () => {
    const { wrapper } = setup({ shell: false, list: false })
    const { result } = renderHook(() => useShellData(), { wrapper })

    await waitFor(() => expect(result.current.shell).toBeDefined())

    expect(result.current.shell?.owner.displayName).toBe('An Nguyễn')
    expect(result.current.shell?.sync.state).toBe('OK')
  })

  it('shows the notifications and registrations the data gives, once there is a source for them', () => {
    const { queryClient, wrapper } = setup({ list: false })
    const shell = createShellSample(AT_CANVAS)
    queryClient.setQueryData(SHELL_QUERY_KEY, { ...shell, unreadNotifications: 4, navCounts: { ...shell.navCounts, registrationsNew: 2 } })

    const { result } = renderHook(() => useShellData(), { wrapper })

    expect(result.current.shell?.unreadNotifications).toBe(4)
    expect(result.current.shell?.navCounts.registrationsNew).toBe(2)
  })
})

describe('the account counts of the shell (NS-01, NS-03, D-321, D-326)', () => {
  it('come from the account list, not from the shell data', () => {
    const { queryClient, wrapper } = setup()
    const shell = createShellSample(AT_CANVAS)
    queryClient.setQueryData(SHELL_QUERY_KEY, { ...shell, accountCount: 9, navCounts: { ...shell.navCounts, accountsNeedingAction: 7 } })
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('AUTH_EXPIRED', 'ERROR', 'CONNECTED', 'DISABLED'))

    const { result } = renderHook(() => useShellData(), { wrapper })

    expect(result.current.shell?.accountCount).toBe(4)
    expect(result.current.shell?.navCounts.accountsNeedingAction).toBe(2)
  })

  it('are not said before the list has come: no total, none needing action, rather than the sample ones', () => {
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

  it('leave the other counts of the shell data as they are', () => {
    const { queryClient, wrapper } = setup()
    const shell = createShellSample(AT_CANVAS)

    const { result } = renderHook(() => useShellData(), { wrapper })

    expect(result.current.shell?.navCounts.inboxUnread).toBe(shell.navCounts.inboxUnread)
    expect(result.current.shell?.navCounts.tasksDue).toBe(shell.navCounts.tasksDue)
    expect(queryClient.getQueryData(SHELL_QUERY_KEY)).toEqual(shell)
  })
})
