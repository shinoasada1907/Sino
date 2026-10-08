import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ShellData } from '@/app/shell/shell.types'
import { SHELL_QUERY_KEY } from '@/app/shell/useShellData'
import type { OverviewData } from '@/features/overview/overview.types'
import { OVERVIEW_QUERY_KEY } from '@/features/overview/useOverview'
import { deleteAccount, fetchAccountExtras, fetchAccounts, saveChannel } from './accounts.api'
import type { AccountExtras, AccountItem, AccountsData, ChannelKind } from './accounts.types'
import { needsAttention } from './format'

export const ACCOUNTS_QUERY_KEY = ['accounts'] as const
const extrasKey = (accountId: string) => ['accounts', accountId, 'extras'] as const

export interface AccountsQuery {
  list: AccountsData | undefined
  /** When the list arrived (milliseconds since the epoch, 0 before any data). */
  receivedAt: number
  /** Why the last load failed; the pages show it only while there is no list. */
  error: Error | null
  retry: () => void
}

/** The account list, from `fetchAccounts` (the backend API, D-56). */
export function useAccounts(): AccountsQuery {
  const { data, dataUpdatedAt, error, refetch } = useQuery({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: fetchAccounts,
    staleTime: Infinity,
  })
  return { list: data, receivedAt: dataUpdatedAt, error, retry: () => void refetch() }
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
 * Disconnects an account, then takes it out of every screen that shows it: the list, the shell counts and the overview.
 */
export function useDisconnectAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: (_result, { accountId }: Disconnect) => {
      const list = queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)
      const removed = list?.accounts.find((account) => account.id === accountId)
      if (list) {
        queryClient.setQueryData(ACCOUNTS_QUERY_KEY, withoutAccount(list, accountId))
      }
      queryClient.removeQueries({ queryKey: extrasKey(accountId) })
      queryClient.setQueryData<ShellData>(SHELL_QUERY_KEY, (shell) =>
        shell && {
          ...shell,
          accountCount: Math.max(0, shell.accountCount - 1),
          navCounts: {
            ...shell.navCounts,
            accountsNeedingAction: shell.navCounts.accountsNeedingAction - (removed && needsAttention(removed) ? 1 : 0),
          },
        },
      )
      queryClient.setQueryData<OverviewData>(OVERVIEW_QUERY_KEY, (overview) =>
        overview && { ...overview, accounts: overview.accounts.filter((account) => account.id !== accountId) },
      )
    },
  })
}
