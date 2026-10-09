import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSyncStatus, requestSync } from './accounts.api'
import type { SyncStatus } from './accounts.types'

// Under ['accounts'], so that `account.changed` of the event stream reads it again.
const syncStatusKey = (accountId: string) => ['accounts', accountId, 'sync'] as const

/** The live sync of an account, asked only once its first import is done. */
export function useSyncStatus(accountId: string, importDone: boolean): SyncStatus | undefined {
  const { data } = useQuery({ queryKey: syncStatusKey(accountId), queryFn: () => fetchSyncStatus(accountId), staleTime: Infinity, enabled: importDone })
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
