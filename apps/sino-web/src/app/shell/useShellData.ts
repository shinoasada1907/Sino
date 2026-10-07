import { useQuery } from '@tanstack/react-query'
import { createShellSample } from './shell.sample'
import type { ShellData } from './shell.types'

export const SHELL_QUERY_KEY = ['shell'] as const

/**
 * Shell data for every screen, and when it arrived (milliseconds since the epoch, 0 before any data).
 * Returns sample data until the backend has an endpoint for it (D-42).
 */
export function useShellData(): { shell: ShellData | undefined; receivedAt: number } {
  const { data, dataUpdatedAt } = useQuery({
    queryKey: SHELL_QUERY_KEY,
    queryFn: () => createShellSample(new Date()),
    staleTime: Infinity,
  })
  return { shell: data, receivedAt: dataUpdatedAt }
}
