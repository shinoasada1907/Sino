import type { ShellData } from './shell.types'

/** Sample shell data shaped like the "Sino UI" canvas, with times relative to `now`. */
export function createShellSample(now: Date): ShellData {
  return {
    owner: { displayName: 'An Nguyễn' },
    accountCount: 3,
    navCounts: { inboxUnread: 12, tasksOpen: 3, tasksOverdue: 1, accountsNeedingAction: 1, registrationsNew: 1 },
    unreadNotifications: 3,
    sync: { state: 'OK', lastSyncedAt: new Date(now.getTime() - 2 * 60_000).toISOString(), progress: null },
  }
}
