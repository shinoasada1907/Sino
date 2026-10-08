import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/problem'
import { createQueryClient, shouldRetry } from './queryClient'

describe('retrying a failed read', () => {
  it('never retries an answer of the server about the request itself (4xx)', () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(shouldRetry(0, new ApiError(status, 'X', null))).toBe(false)
    }
  })

  it('retries twice when nothing answered or the server failed', () => {
    for (const error of [new ApiError(0, 'NETWORK_ERROR', null), new ApiError(503, 'HTTP_503', null), new Error('boom')]) {
      expect(shouldRetry(0, error)).toBe(true)
      expect(shouldRetry(1, error)).toBe(true)
      expect(shouldRetry(2, error)).toBe(false)
    }
  })

  it('is the default of the app query client', () => {
    expect(createQueryClient().getDefaultOptions().queries?.retry).toBe(shouldRetry)
  })
})
