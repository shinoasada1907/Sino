// The Vietnamese text of the sign-in page, from the error codes of the backend catalog.
import { ApiError, NETWORK_ERROR } from '@/shared/api/problem'

/** How long the backend locks signing in after too many wrong passwords (D-35: 5 tries, 15 minutes). */
export const LOCK_MINUTES = 15

export function loginFailure(error: Error): { title: string; text: string | null } {
  if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
    const left = error.extra.remainingAttempts
    return {
      title: 'Email hoặc mật khẩu không đúng',
      text: typeof left === 'number' ? `Còn ${left} lần thử trước khi phải đợi ${LOCK_MINUTES} phút.` : null,
    }
  }
  if (error instanceof ApiError && error.code === 'LOGIN_LOCKED') {
    const seconds = error.extra.retryAfterSeconds
    const wait = typeof seconds === 'number' ? `${Math.max(1, Math.ceil(seconds / 60))} phút` : 'ít phút'
    return { title: 'Tạm khóa đăng nhập', text: `Sai mật khẩu quá nhiều lần. Thử lại sau ${wait}.` }
  }
  if (!(error instanceof ApiError) || error.code === NETWORK_ERROR || error.status >= 500) {
    return { title: 'Không đăng nhập được', text: 'Không kết nối được máy chủ Sino. Thử lại sau ít phút.' }
  }
  return { title: 'Không đăng nhập được', text: 'Đã có lỗi. Thử lại.' }
}
