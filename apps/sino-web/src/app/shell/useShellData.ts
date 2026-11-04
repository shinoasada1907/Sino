import { useMemo } from 'react'
import { useMe } from '@/features/auth/useAuth'
import { useAccounts } from '@/features/accounts/useAccounts'
import { needsAttention } from '@/features/accounts/format'
import type { ShellData } from './shell.types'

export const SHELL_QUERY_KEY = ['shell'] as const

/**
 * Shell data for every screen, derived directly from the authenticated user and connected accounts.
 */
export function useShellData(): { shell: ShellData | undefined; receivedAt: number } {
  const { data: me, dataUpdatedAt: meUpdatedAt } = useMe()
  const { list, receivedAt: accountsUpdatedAt } = useAccounts()

  const shell = useMemo((): ShellData => {
    const displayName = me?.displayName || me?.email || 'Người dùng Sino'
    const shortName = me?.displayName ? me.displayName.trim().split(/\s+/).pop() ?? null : (me?.email ? me.email.split('@')[0] : null)

    const accounts = list?.accounts ?? []
    const lastSyncedAt = accounts
      .map((a) => a.lastSyncedAt)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null

    const accountCount = list ? accounts.length : null
    const accountsNeedingAction = accounts.filter(needsAttention).length

    return {
      owner: { displayName, shortName },
      accountCount,
      navCounts: {
        messagesUnread: null,
        inboxUnread: 0,
        tasksDue: 0,
        tasksOverdue: 0,
        accountsNeedingAction,
        registrationsNew: 0,
      },
      unreadNotifications: 0,
      sync: {
        state: 'OK',
        lastSyncedAt,
        progress: null,
      },
    }
  }, [me, list])

  return { shell, receivedAt: Math.max(meUpdatedAt, accountsUpdatedAt) }
}
