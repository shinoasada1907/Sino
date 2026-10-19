import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { INBOX_QUERY_KEY } from '@/features/inbox/useInbox'
import type { OverviewData } from '@/features/overview/overview.types'
import { OVERVIEW_QUERY_KEY } from '@/features/overview/useOverview'
import { useStreamState } from '@/shared/realtime/streamState'
import { deleteAccount, fetchAccountExtras, fetchAccounts, saveChannel } from './accounts.api'
import type { AccountExtras, AccountItem, AccountsData, ChannelKind } from './accounts.types'
import { needsAttention } from './format'

export const ACCOUNTS_QUERY_KEY = ['accounts'] as const
// One query for the account screens and for the navigation of the shell, so both read the same list.
const accountsQuery = queryOptions({ queryKey: ACCOUNTS_QUERY_KEY, queryFn: fetchAccounts, staleTime: Infinity })
/** How often the list is asked again while a first import runs. */
export const SYNC_POLL_MS = 2000
const extrasKey = (accountId: string) => ['accounts', accountId, 'extras'] as const

export interface AccountsQuery {
  list: AccountsData | undefined
  /** When the list arrived (milliseconds since the epoch, 0 before any data). */
  receivedAt: number
  /** Why the last load failed; the pages show it only while there is no list. */
  error: Error | null
  retry: () => void
}

/**
 * The account list, from `fetchAccounts` (the backend API, D-56). While a first import runs it is read again on each
 * `account.changed` of the event stream, or every 2 s when the stream is not open (D-91). When an import is done the inbox
 * is read again, since it now has the imported conversations.
 */
export function useAccounts(): AccountsQuery {
  const queryClient = useQueryClient()
  const live = useStreamState() === 'open'
  const { data, dataUpdatedAt, error, refetch } = useQuery({
    ...accountsQuery,
    refetchInterval: (query) =>
      !live && query.state.data?.accounts.some((account) => account.firstImport?.state === 'RUNNING') ? SYNC_POLL_MS : false,
  })
  const imported = data?.accounts.filter((account) => account.firstImport?.state === 'DONE').map((account) => account.id).join(' ') ?? ''
  useEffect(() => {
    if (imported !== '') {
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY })
    }
  }, [imported, queryClient])
  return { list: data, receivedAt: dataUpdatedAt, error, retry: () => void refetch() }
}

export interface AccountCounts {
  total: number
  /** The accounts the owner has to act on (`needsAttention`): signed out or failing. */
  needingAction: number
}

const countsOf = (list: AccountsData): AccountCounts => ({ total: list.accounts.length, needingAction: list.accounts.filter(needsAttention).length })

/**
 * How many accounts there are and how many of them need the owner, for the navigation of the shell (D-321, D-326);
 * `undefined` until the list has come. It reads the shared list but not through `useAccounts`, which reads the inbox
 * again for every finished first import: right on the account screens, not at every start of the app.
 */
export function useAccountCounts(): AccountCounts | undefined {
  return useQuery({ ...accountsQuery, select: countsOf }).data
}

/**
 * One account for the detail page. The account itself comes from the list, so a change made on either page shows
 * on both; the detail sections (`AccountExtras`) load on their own. `notFound` is true once the list has no such id.
 */
export function useAccount(accountId: string): AccountsQuery & {
  account: AccountItem | undefined
  extras: AccountExtras | undefined
  notFound: boolean
} {
  const query = useAccounts()
  const { list } = query
  const account = list?.accounts.find((item) => item.id === accountId)
  const { data: extras } = useQuery({
    queryKey: extrasKey(accountId),
    queryFn: () => fetchAccountExtras(accountId),
    staleTime: Infinity,
    enabled: account !== undefined,
  })
  return { ...query, account, extras, notFound: list !== undefined && account === undefined }
}

/** The list with one channel of one account turned on or off. */
export function withChannel(data: AccountsData, accountId: string, kind: ChannelKind, enabled: boolean): AccountsData {
  return {
    ...data,
    accounts: data.accounts.map((account) =>
      account.id !== accountId
        ? account
        : { ...account, channels: account.channels.map((channel) => (channel.kind === kind ? { ...channel, enabled } : channel)) },
    ),
  }
}

/** The list without one account; its stored messages stay, so the total does not change (deleting them waits for F05). */
export function withoutAccount(data: AccountsData, accountId: string): AccountsData {
  return { ...data, accounts: data.accounts.filter((account) => account.id !== accountId) }
}

type SetChannel = { accountId: string; kind: ChannelKind; enabled: boolean }

/**
 * Turns a channel on or off. The switch moves at once (optimistic update) and moves back if saving fails.
 */
export function useSetChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveChannel,
    onMutate: async ({ accountId, kind, enabled }: SetChannel) => {
      await queryClient.cancelQueries({ queryKey: ACCOUNTS_QUERY_KEY, exact: true })
      const previous = queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)
      if (previous) {
        queryClient.setQueryData(ACCOUNTS_QUERY_KEY, withChannel(previous, accountId, kind, enabled))
      }
      return { previous }
    },
    onError: (_error, _change, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ACCOUNTS_QUERY_KEY, context.previous)
      }
    },
  })
}

type Disconnect = { accountId: string }

/**
 * Disconnects an account, then takes it out of every screen that shows it: the list (the counts of the shell follow it,
 * D-326) and the overview.
 */
export function useDisconnectAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: (_result, { accountId }: Disconnect) => {
      const list = queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)
      if (list) {
        queryClient.setQueryData(ACCOUNTS_QUERY_KEY, withoutAccount(list, accountId))
      }
      queryClient.removeQueries({ queryKey: extrasKey(accountId) })
      queryClient.setQueryData<OverviewData>(OVERVIEW_QUERY_KEY, (overview) =>
        overview && { ...overview, accounts: overview.accounts.filter((account) => account.id !== accountId) },
      )
    },
  })
}
