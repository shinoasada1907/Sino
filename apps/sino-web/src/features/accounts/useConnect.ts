import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConnectProviders, fetchSyncEstimate, leaveTo, startConnect, startInitialSync } from './accounts.api'
import type { AccountsData } from './accounts.types'
import { initialSyncView } from './connect.format'
import type { ConnectableProvider, SyncEstimate, SyncOptions, SyncRange } from './connect.types'
import { ACCOUNTS_QUERY_KEY } from './useAccounts'

export const PROVIDERS_QUERY_KEY = ['providers'] as const

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

/** Starts the first sync with the options of step 4; the account then shows its progress in the list. */
export function useStartInitialSync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, options }: { accountId: string; options: SyncOptions }) => startInitialSync(accountId, options),
    onSuccess: (status, { accountId }) => {
      const { percent } = initialSyncView(status)
      queryClient.setQueryData<AccountsData>(ACCOUNTS_QUERY_KEY, (list) =>
        list && {
          ...list,
          accounts: list.accounts.map((account) => (account.id === accountId ? { ...account, syncProgress: percent } : account)),
        },
      )
    },
  })
}
