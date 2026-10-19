import type { Instant } from '@/shared/domain'

export type { Instant } from '@/shared/domain'

export interface NavCounts {
  /** Unread chats; null when the backend cannot count them apart from email (f05c). */
  messagesUnread: number | null
  inboxUnread: number
  /** Tasks that are due: late, or due today (D-83). */
  tasksDue: number
  tasksOverdue: number
  accountsNeedingAction: number
  registrationsNew: number
}

/** What the app shell shows on every screen; part of the data contract handed to the backend. */
export interface ShellData {
  /** `shortName` is what the greeting uses ("An"); without it the greeting uses `displayName`. */
  owner: { displayName: string; shortName: string | null }
  /** How many accounts the owner has; null until the account list has come (D-326). */
  accountCount: number | null
  navCounts: NavCounts
  unreadNotifications: number
  sync: {
    state: 'OK' | 'SYNCING' | 'IDLE'
    lastSyncedAt: Instant | null
    /** 0..100 while the first sync runs, otherwise null. */
    progress: number | null
  }
}
