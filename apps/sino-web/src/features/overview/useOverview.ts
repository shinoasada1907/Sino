import { useQuery } from '@tanstack/react-query'
import type { OverviewData } from './overview.types'

export const OVERVIEW_QUERY_KEY = ['overview'] as const

const EMPTY_OVERVIEW: OverviewData = {
  generatedAt: new Date().toISOString(),
  providers: [],
  accounts: [],
  inbox: null,
  today: null,
  syncActivity: null,
  registrations: null,
  activity: [],
}

/**
 * Data of the Tổng quan screen, and when it arrived (milliseconds since the epoch, 0 before any data).
 * Returns empty data until the backend has `GET /api/overview` (D-42).
 */
export function useOverview(): { overview: OverviewData | undefined; receivedAt: number } {
  const { data, dataUpdatedAt } = useQuery({
    queryKey: OVERVIEW_QUERY_KEY,
    queryFn: () => EMPTY_OVERVIEW,
    staleTime: Infinity,
  })
  return { overview: data, receivedAt: dataUpdatedAt }
}
