/** ISO-8601 instant in UTC, as the API sends it. */
export type Instant = string

export interface NavCounts {
  inboxUnread: number
  tasksOpen: number
  tasksOverdue: number
  accountsNeedingAction: number
  registrationsNew: number
}

/** What the app shell shows on every screen; part of the data contract handed to the backend. */
export interface ShellData {
  /** `shortName` is what the greeting uses ("An"); without it the greeting uses `displayName`. */
  owner: { displayName: string; shortName: string | null }
  accountCount: number
  navCounts: NavCounts
  unreadNotifications: number
  sync: {
    state: 'OK' | 'SYNCING' | 'IDLE'
    lastSyncedAt: Instant | null
    /** 0..100 while the first sync runs, otherwise null. */
    progress: number | null
  }
}
