import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/problem'
import { loginFailure } from './format'

describe('loginFailure', () => {
  it('counts the tries left after a wrong password, when the backend says', () => {
    expect(loginFailure(new ApiError(401, 'INVALID_CREDENTIALS', null, [], { remainingAttempts: 1 }))).toEqual({
      title: 'Email hoặc mật khẩu không đúng',
      text: 'Còn 1 lần thử trước khi phải đợi 15 phút.',
    })
    expect(loginFailure(new ApiError(401, 'INVALID_CREDENTIALS', null)).text).toBeNull()
  })

  it('rounds the wait of a lock up to whole minutes', () => {
    expect(loginFailure(new ApiError(429, 'LOGIN_LOCKED', null, [], { retryAfterSeconds: 61 })).text).toBe('Sai mật khẩu quá nhiều lần. Thử lại sau 2 phút.')
    expect(loginFailure(new ApiError(429, 'LOGIN_LOCKED', null, [], { retryAfterSeconds: 5 })).text).toBe('Sai mật khẩu quá nhiều lần. Thử lại sau 1 phút.')
    expect(loginFailure(new ApiError(429, 'LOGIN_LOCKED', null)).text).toBe('Sai mật khẩu quá nhiều lần. Thử lại sau ít phút.')
  })

  it('blames the connection when the server did not answer or failed', () => {
    const server = 'Không kết nối được máy chủ Sino. Thử lại sau ít phút.'
    expect(loginFailure(new ApiError(0, 'NETWORK_ERROR', null)).text).toBe(server)
    expect(loginFailure(new ApiError(502, 'HTTP_502', null)).text).toBe(server)
    expect(loginFailure(new Error('boom')).text).toBe(server)
    expect(loginFailure(new ApiError(400, 'VALIDATION_FAILED', null)).text).toBe('Đã có lỗi. Thử lại.')
  })
})
