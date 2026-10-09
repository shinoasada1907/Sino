import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { INBOX_QUERY_KEY } from '@/features/inbox/useInbox'
import { fetchConnectProviders, fetchInitialSync, fetchSyncEstimate, leaveTo, startConnect, startInitialSync } from './accounts.api'
import type { AccountsData } from './accounts.types'
import { initialSyncView } from './connect.format'
import type { ConnectableProvider, InitialSyncStatus, SyncEstimate, SyncOptions, SyncRange } from './connect.types'
import { ACCOUNTS_QUERY_KEY } from './useAccounts'

export const PROVIDERS_QUERY_KEY = ['providers'] as const
export const initialSyncKey = (accountId: string) => ['accounts', accountId, 'initial-sync'] as const
/** How often a running first import is asked about. */
export const SYNC_POLL_MS = 2000

/** The provider catalog of the connect wizard, asked for only while the wizard is open. */
export function useConnectProviders(open = true): { providers: ConnectableProvider[] | undefined } {
  const { data } = useQuery({ queryKey: PROVIDERS_QUERY_KEY, queryFn: fetchConnectProviders, staleTime: Infinity, enabled: open })
  return { providers: data }
}

/** Starts a connect (or a sign-in again with `accountId`) and leaves Sino for the address it gets back (D-47). */
export function useStartConnect() {
  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string | null }) => startConnect(provider, accountId),
    onSuccess: ({ authorizationUrl }) => leaveTo(authorizationUrl),
  })
}

/** The estimate of the first sync for the picked range; null when the backend has none. */
export function useSyncEstimate(accountId: string | null, range: SyncRange): { estimate: SyncEstimate | null | undefined } {
  const { data } = useQuery({
    queryKey: ['accounts', accountId, 'sync-estimate', range],
    queryFn: () => fetchSyncEstimate(accountId ?? '', range),
    staleTime: Infinity,
    enabled: accountId !== null,
  })
  return { estimate: data }
}

// The list shows the share of a running import; anything else clears it.
function showProgress(queryClient: QueryClient, accountId: string, status: InitialSyncStatus) {
  const syncProgress = status.state === 'RUNNING' ? initialSyncView(status).percent : null
  queryClient.setQueryData<AccountsData>(ACCOUNTS_QUERY_KEY, (list) =>
    list && { ...list, accounts: list.accounts.map((account) => (account.id === accountId ? { ...account, syncProgress } : account)) },
  )
}

/** Starts the first import with the options of step 4 (or goes on with a failed one); its status is then followed. */
export function useStartInitialSync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, options }: { accountId: string; options: SyncOptions }) => startInitialSync(accountId, options),
    onSuccess: (status, { accountId }) => {
      queryClient.setQueryData(initialSyncKey(accountId), status)
      showProgress(queryClient, accountId, status)
    },
  })
}

/**
 * The status of an account's first import, asked again every 2 s while it runs. Once it is DONE the inbox is read again,
 * since it now has the imported conversations.
 */
export function useInitialSync(accountId: string | null): { status: InitialSyncStatus | undefined } {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: initialSyncKey(accountId ?? ''),
    queryFn: () => fetchInitialSync(accountId ?? ''),
    enabled: accountId !== null,
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.state === 'RUNNING' ? SYNC_POLL_MS : false),
  })
  useEffect(() => {
    if (accountId === null || data === undefined) {
      return
    }
    showProgress(queryClient, accountId, data)
    if (data.state === 'DONE') {
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY })
    }
  }, [accountId, data, queryClient])
  return { status: data }
}
