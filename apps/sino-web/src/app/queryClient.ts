import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/problem'

/**
 * A failed read is tried again only when trying again can help: twice when nothing answered or the server failed,
 * never when the server answered about the request itself (4xx). Retrying a 401 would report the end of the session
 * once per try, and a 404 would only show later.
 */
export function shouldRetry(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false
  }
  return failureCount < 2
}

/** The server-data cache of the app. */
export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } })
}
