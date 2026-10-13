import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSyncStatus } from './accounts.api'
import { useSyncStatus } from './useLiveSync'

vi.mock('./accounts.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./accounts.api')>()),
  fetchSyncStatus: vi.fn(async () => ({ importDone: true, lastSyncAt: '2026-10-02T07:05:00Z', lastError: null, push: 'OFF', pushExpiresAt: null })),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('the sync status of an imported account (after BE-49)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fetchSyncStatus).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is read again every minute while shown, since the backend syncs about every minute', async () => {
    renderHook(() => useSyncStatus('acc-1', true), { wrapper })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSyncStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)

    expect(fetchSyncStatus).toHaveBeenCalledTimes(2)
  })

  it('is not asked for an account still importing', async () => {
    renderHook(() => useSyncStatus('acc-1', false), { wrapper })

    await vi.advanceTimersByTimeAsync(60_000)

    expect(fetchSyncStatus).not.toHaveBeenCalled()
  })
})
