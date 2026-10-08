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

/**
 * The account list, and when it arrived (milliseconds since the epoch, 0 before any data).
 * The data comes from `fetchAccounts` (sample data for now, see `accounts.api.ts`).
 */
export function useAccounts(): { list: AccountsData | undefined; receivedAt: number } {
  const { data, dataUpdatedAt } = useQuery({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: fetchAccounts,
    staleTime: Infinity,
  })
  return { list: data, receivedAt: dataUpdatedAt }
}

/**
 * One account for the detail page. The account itself comes from the list, so a change made on either page shows
 * on both; the detail sections (`AccountExtras`) load on their own. `notFound` is true once the list has no such id.
 */
export function useAccount(accountId: string): {
  list: AccountsData | undefined
  account: AccountItem | undefined
  extras: AccountExtras | undefined
  notFound: boolean
  receivedAt: number
} {
  const { list, receivedAt } = useAccounts()
  const account = list?.accounts.find((item) => item.id === accountId)
  const { data: extras } = useQuery({
    queryKey: extrasKey(accountId),
    queryFn: () => fetchAccountExtras(accountId),
    staleTime: Infinity,
    enabled: account !== undefined,
  })
  return { list, account, extras, notFound: list !== undefined && account === undefined, receivedAt }
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

/** The list without one account; its stored messages leave the total only when they are deleted too. */
export function withoutAccount(data: AccountsData, accountId: string, deleteMessages: boolean): AccountsData {
  const removed = data.accounts.find((account) => account.id === accountId)
  return {
    ...data,
    accounts: data.accounts.filter((account) => account.id !== accountId),
    storedMessages: data.storedMessages - (deleteMessages && removed ? removed.storedMessages : 0),
  }
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

type Disconnect = { accountId: string; deleteMessages: boolean }

/**
 * Disconnects an account, then takes it out of every screen that shows it: the list, the shell counts and the overview.
 */
export function useDisconnectAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: (_result, { accountId, deleteMessages }: Disconnect) => {
      const list = queryClient.getQueryData<AccountsData>(ACCOUNTS_QUERY_KEY)
      const removed = list?.accounts.find((account) => account.id === accountId)
      if (list) {
        queryClient.setQueryData(ACCOUNTS_QUERY_KEY, withoutAccount(list, accountId, deleteMessages))
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
