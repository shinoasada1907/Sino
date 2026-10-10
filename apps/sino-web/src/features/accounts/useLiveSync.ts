import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSyncStatus, requestSync } from './accounts.api'
import type { SyncStatus } from './accounts.types'

// Under ['accounts'], so that `account.changed` of the event stream reads it again.
const syncStatusKey = (accountId: string) => ['accounts', accountId, 'sync'] as const
// The backend syncs about every minute (BE-49) without an event for each success; read along with it.
const SYNC_STATUS_POLL_MS = 60_000

/** The live sync of an account, asked only once its first import is done, and again every minute while shown. */
export function useSyncStatus(accountId: string, importDone: boolean): SyncStatus | undefined {
  const { data } = useQuery({
    queryKey: syncStatusKey(accountId),
    queryFn: () => fetchSyncStatus(accountId),
    staleTime: Infinity,
    enabled: importDone,
    refetchInterval: SYNC_STATUS_POLL_MS,
  })
  return data
}

/** "Đồng bộ ngay" of an imported account; the answer is its sync status. */
export function useRequestSync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => requestSync(accountId),
    onSuccess: (status, accountId) => queryClient.setQueryData(syncStatusKey(accountId), status),
  })
}
