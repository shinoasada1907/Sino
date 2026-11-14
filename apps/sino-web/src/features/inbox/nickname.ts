import { ApiError, NETWORK_ERROR } from '@/shared/api/problem'

/** The longest nickname Sino takes (zalo-nicknames, D-414); the server refuses a longer one with 400. */
export const NICKNAME_MAX = 50

/** What the "Đặt biệt danh" box says when the request fails; the typed text stays in the box. */
export function nicknameFailure(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NICKNAME_REJECTED':
        return 'Zalo không cho đặt biệt danh cho người này.'
      case 'NICKNAME_NOT_SUPPORTED':
        return 'Cuộc trò chuyện này không đặt được biệt danh.'
      case NETWORK_ERROR:
        return 'Mất kết nối. Biệt danh chưa được lưu, hãy thử lại.'
      default:
        if (error.status === 400) {
          return `Biệt danh tối đa ${NICKNAME_MAX} ký tự.`
        }
    }
  }
  return 'Chưa nối được Zalo, biệt danh chưa được lưu. Hãy thử lại sau.'
}
