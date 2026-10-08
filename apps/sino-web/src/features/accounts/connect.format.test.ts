import { describe, expect, it } from 'vitest'
import { providerDescription } from '@/shared/format'
import type { ConnectableProvider } from './connect.types'
import {
  connectErrorMessage,
  estimateParts,
  identityName,
  initialSyncView,
  notAskedNote,
  providerTags,
  scopePurpose,
  wizardStep,
} from './connect.format'

function provider(extra: Partial<ConnectableProvider>): ConnectableProvider {
  return { type: 'gmail', displayName: 'Gmail', capabilities: [], connectable: true, scopes: [], ...extra }
}

describe('providers of the wizard', () => {
  it('describes each provider, and nothing for an unknown one', () => {
    expect(providerDescription('gmail')).toBe('Thư điện tử')
    expect(providerDescription('zalo')).toBe('Tin nhắn cá nhân và nhóm')
    expect(providerDescription('messenger')).toBe('Tin nhắn Facebook')
    expect(providerDescription('google')).toBe('Danh tính và các website bạn đăng nhập')
    expect(providerDescription('telegram')).toBe('Tin nhắn')
    expect(providerDescription('viber')).toBeNull()
  })

  it('tags what a provider can do, or "Sắp có" when it cannot be connected yet', () => {
    expect(providerTags(provider({ capabilities: ['SEND_MESSAGES', 'READ_MESSAGES', 'ATTACHMENTS'] }))).toEqual(['Đọc', 'Gửi'])
    expect(providerTags(provider({ capabilities: ['REGISTRATIONS'] }))).toEqual(['Đăng ký'])
    expect(providerTags(provider({ capabilities: ['READ_MESSAGES'], connectable: false }))).toEqual(['Sắp có'])
  })

  it('names the identity the user signs in with', () => {
    expect(identityName('gmail', 'Gmail')).toBe('Google')
    expect(identityName('messenger', 'Messenger')).toBe('Facebook')
    expect(identityName('zalo', 'Zalo')).toBe('Zalo')
    expect(identityName('viber', 'Viber')).toBe('Viber')
  })
})

describe('scopes', () => {
  it('says what each scope is for, and nothing for an unknown one', () => {
    expect(scopePurpose('gmail.readonly')).toBe('Để thư hiện trong Hộp thư hợp nhất và tìm kiếm được.')
    expect(scopePurpose('userinfo.email')).toBe('Để biết thư nào thuộc tài khoản này.')
    expect(scopePurpose('weird.scope')).toBeNull()
  })

  it('says which scopes Sino does not ask for', () => {
    expect(notAskedNote('gmail')).toBe('Sino không xin quyền xóa thư, đổi cài đặt Gmail hay đọc danh bạ.')
    expect(notAskedNote('zalo')).toBeNull()
  })
})

describe('steps', () => {
  it('labels, titles and explains each step, with the identity in the sign-in step', () => {
    expect(wizardStep(1, 'Google')).toEqual({
      label: '1 · Nhà cung cấp',
      title: 'Chọn nhà cung cấp',
      note: 'Chỉ xin quyền tối thiểu. Bạn xem lại ở bước 2.',
      next: 'Tiếp tục',
    })
    expect(wizardStep(2, 'Google')).toMatchObject({ label: '2 · Quyền', title: 'Xem lại quyền truy cập', next: 'Đồng ý và tiếp tục' })
    expect(wizardStep(3, 'Google')).toMatchObject({
      label: '3 · Đăng nhập',
      note: 'Đăng nhập diễn ra trên trang của Google.',
      next: 'Tiếp tục tới Google',
    })
    expect(wizardStep(3, 'Facebook')).toMatchObject({ note: 'Đăng nhập diễn ra trên trang của Facebook.', next: 'Tiếp tục tới Facebook' })
    expect(wizardStep(4, 'Google')).toMatchObject({ title: 'Tùy chọn đồng bộ', next: 'Bắt đầu đồng bộ' })
    expect(wizardStep(5, 'Google')).toEqual({ label: '5 · Xong', title: 'Hoàn tất', note: 'Bạn có thể đóng cửa sổ này.', next: null })
  })
})

describe('results', () => {
  it('turns each connect error into a sentence, an unknown code into the general one', () => {
    expect(connectErrorMessage('CONNECT_CANCELLED')).toBe('Bạn đã hủy kết nối.')
    expect(connectErrorMessage('CONNECT_STATE_INVALID')).toBe('Phiên kết nối đã hết hạn. Hãy thử lại.')
    expect(connectErrorMessage('CONNECT_SCOPE_DENIED')).toBe('Sino cần quyền đọc Gmail. Hãy thử lại và cho phép đọc thư.')
    expect(connectErrorMessage('CONNECT_WRONG_ACCOUNT')).toBe(
      'Bạn đã chọn một tài khoản Google khác. Hãy chọn đúng tài khoản, hoặc dùng "Thêm Gmail".',
    )
    expect(connectErrorMessage('CONNECT_FAILED')).toBe('Không kết nối được với Google. Hãy thử lại sau.')
    expect(connectErrorMessage('SOMETHING_NEW')).toBe('Không kết nối được với Google. Hãy thử lại sau.')
  })

  it('writes the estimate of the first sync', () => {
    expect(estimateParts({ messages: 1180, minMinutes: 3, maxMinutes: 5 })).toEqual({ messages: 'khoảng 1.180 thư', time: '3–5 phút' })
    expect(estimateParts({ messages: 40, minMinutes: 1, maxMinutes: 1 })).toEqual({ messages: 'khoảng 40 thư', time: '1 phút' })
  })

  it('writes the progress of the first sync', () => {
    expect(initialSyncView({ fetched: 412, total: 1180, remainingMinutes: 3 })).toEqual({
      text: '412 / 1.180 thư · còn khoảng 3 phút',
      percent: 35,
    })
    expect(initialSyncView({ fetched: 412, total: null, remainingMinutes: null })).toEqual({ text: '412 thư', percent: null })
    expect(initialSyncView({ fetched: 0, total: 0, remainingMinutes: 0 })).toEqual({ text: '0 / 0 thư', percent: 100 })
  })
})
