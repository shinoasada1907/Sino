import { useQuery } from '@tanstack/react-query'
import { useAccountCounts } from '@/features/accounts/useAccounts'
import { createShellSample } from './shell.sample'
import type { ShellData } from './shell.types'

export const SHELL_QUERY_KEY = ['shell'] as const

// What the app has of its own today (D-42): the sample of the canvas, except the counts that nothing can tell yet. There is
// no source of notifications or of registrations, so none is flagged (NS-02, D-325); only the owner and the sync line
// are still sample. A backend that tells the shell replaces this function.
function shellToday(now: Date): ShellData {
  const sample = createShellSample(now)
  return { ...sample, unreadNotifications: 0, navCounts: { ...sample.navCounts, registrationsNew: 0 } }
}

/**
 * Shell data for every screen, and when it arrived (milliseconds since the epoch, 0 before any data).
 * The account counts are the real ones, counted from the account list (D-321, D-326): none until the list has come,
 * not the sample's. The rest is `shellToday` until the backend has an endpoint for it.
 */
export function useShellData(): { shell: ShellData | undefined; receivedAt: number } {
  const { data, dataUpdatedAt } = useQuery({
    queryKey: SHELL_QUERY_KEY,
    queryFn: () => shellToday(new Date()),
    staleTime: Infinity,
  })
  const accounts = useAccountCounts()
  const shell = data && {
    ...data,
    accountCount: accounts?.total ?? null,
    navCounts: { ...data.navCounts, accountsNeedingAction: accounts?.needingAction ?? 0 },
  }
  return { shell, receivedAt: dataUpdatedAt }
}
