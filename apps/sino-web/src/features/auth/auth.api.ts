import { api } from '@/shared/api/client'
import { ApiError } from '@/shared/api/problem'

/** `GET /api/auth/me`: who is signed in. */
export interface Me {
  email: string
  displayName: string
}

export interface Credentials {
  email: string
  password: string
  /** "Giữ đăng nhập trên máy này": a remember-me cookie that outlives the session (D-34). */
  rememberMe: boolean
}

/** Who is signed in, or null when nobody is: 401 here is an answer, not a failure. */
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  try {
    return await api.get<Me>('/api/auth/me', signal)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }
    throw error
  }
}

export function login(credentials: Credentials): Promise<void> {
  return api.post('/api/auth/login', credentials)
}

export function logout(): Promise<void> {
  return api.post('/api/auth/logout')
}
