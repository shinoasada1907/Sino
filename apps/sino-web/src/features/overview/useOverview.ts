import { useQuery } from '@tanstack/react-query'
import { createOverviewSample } from './overview.sample'
import type { OverviewData } from './overview.types'

export const OVERVIEW_QUERY_KEY = ['overview'] as const

/**
 * Data of the Tổng quan screen, and when it arrived (milliseconds since the epoch, 0 before any data).
 * Returns sample data until the backend has `GET /api/overview` (D-42); only the query function will change.
 */
export function useOverview(): { overview: OverviewData | undefined; receivedAt: number } {
  const { data, dataUpdatedAt } = useQuery({
    queryKey: OVERVIEW_QUERY_KEY,
    queryFn: () => createOverviewSample(new Date()),
    staleTime: Infinity,
  })
  return { overview: data, receivedAt: dataUpdatedAt }
}
