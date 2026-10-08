// The Vietnamese text of the connect wizard, from provider types, capability and scope codes, and error codes.
import { formatCount, methodLabel } from '@/shared/format'
import type { ConnectableProvider, InitialSyncStatus, SyncEstimate } from './connect.types'

const DESCRIPTIONS: Record<string, string> = {
  gmail: 'Thư điện tử',
  zalo: 'Tin nhắn cá nhân và nhóm',
  messenger: 'Tin nhắn Facebook',
  google: 'Danh tính và các website bạn đăng nhập',
  telegram: 'Tin nhắn',
}

/** The line under a provider name in step 1, or null for a provider the web does not know. */
export function providerDescription(type: string): string | null {
  return DESCRIPTIONS[type] ?? null
}

const CAPABILITY_TAGS: [capability: string, tag: string][] = [
  ['READ_MESSAGES', 'Đọc'],
  ['SEND_MESSAGES', 'Gửi'],
  ['REGISTRATIONS', 'Đăng ký'],
]

/** "Đọc", "Gửi"…; a provider that cannot be connected yet only says "Sắp có". */
export function providerTags(provider: ConnectableProvider): string[] {
  if (!provider.connectable) {
    return ['Sắp có']
  }
  return CAPABILITY_TAGS.filter(([capability]) => provider.capabilities.includes(capability)).map(([, tag]) => tag)
}

// The account the user signs in with on the provider's own page.
const IDENTITIES: Record<string, string> = { gmail: 'google', google: 'google', messenger: 'facebook', zalo: 'zalo' }

/** "Google" for Gmail, "Facebook" for Messenger; otherwise the provider name. */
export function identityName(type: string, displayName: string): string {
  const identity = IDENTITIES[type]
  return identity ? methodLabel(identity) : displayName
}

const PURPOSES: Record<string, string> = {
  'gmail.readonly': 'Để thư hiện trong Hộp thư hợp nhất và tìm kiếm được.',
  'userinfo.email': 'Để biết thư nào thuộc tài khoản này.',
  'gmail.send': 'Để trả lời ngay trong Sino.',
}

/** Why Sino asks for a scope, or null for a scope the web does not know. */
export function scopePurpose(code: string): string | null {
  return PURPOSES[code] ?? null
}

const NOT_ASKED: Record<string, string> = {
  gmail: 'Sino không xin quyền xóa thư, đổi cài đặt Gmail hay đọc danh bạ.',
}

export function notAskedNote(type: string): string | null {
  return NOT_ASKED[type] ?? null
}

/** Label, title, footer note and main button of each of the five steps (D-47 order). */
export function wizardStep(step: number, identity: string): { label: string; title: string; note: string; next: string | null } {
  switch (step) {
    case 1:
      return { label: '1 · Nhà cung cấp', title: 'Chọn nhà cung cấp', note: 'Chỉ xin quyền tối thiểu. Bạn xem lại ở bước 2.', next: 'Tiếp tục' }
    case 2:
      return { label: '2 · Quyền', title: 'Xem lại quyền truy cập', note: 'Thu hồi quyền bất cứ lúc nào trong Tài khoản.', next: 'Đồng ý và tiếp tục' }
    case 3:
      return { label: '3 · Đăng nhập', title: 'Đăng nhập', note: `Đăng nhập diễn ra trên trang của ${identity}.`, next: `Tiếp tục tới ${identity}` }
    case 4:
      return { label: '4 · Đồng bộ', title: 'Tùy chọn đồng bộ', note: 'Đổi lại sau trong chi tiết tài khoản.', next: 'Bắt đầu đồng bộ' }
    default:
      return { label: '5 · Xong', title: 'Hoàn tất', note: 'Bạn có thể đóng cửa sổ này.', next: null }
  }
}

const ERRORS: Record<string, string> = {
  CONNECT_CANCELLED: 'Bạn đã hủy kết nối.',
  CONNECT_STATE_INVALID: 'Phiên kết nối đã hết hạn. Hãy thử lại.',
  CONNECT_SCOPE_DENIED: 'Sino cần quyền đọc Gmail. Hãy thử lại và cho phép đọc thư.',
  CONNECT_WRONG_ACCOUNT: 'Bạn đã chọn một tài khoản Google khác. Hãy chọn đúng tài khoản, hoặc dùng "Thêm Gmail".',
  CONNECT_FAILED: 'Không kết nối được với Google. Hãy thử lại sau.',
}

/** The message for `?connectError=CODE` (catalog of F04a); an unknown code gets the general one. */
export function connectErrorMessage(code: string): string {
  return ERRORS[code] ?? ERRORS.CONNECT_FAILED
}

/** "khoảng 1.180 thư" and "3–5 phút" */
export function estimateParts(estimate: SyncEstimate): { messages: string; time: string } {
  const { minMinutes, maxMinutes } = estimate
  return {
    messages: `khoảng ${formatCount(estimate.messages)} thư`,
    time: minMinutes === maxMinutes ? `${minMinutes} phút` : `${minMinutes}–${maxMinutes} phút`,
  }
}

/** "412 / 1.180 thư · còn khoảng 3 phút" and the share done, when the total is known. */
export function initialSyncView(status: InitialSyncStatus): { text: string; percent: number | null } {
  const { fetched, total, remainingMinutes } = status
  const count = total === null ? `${formatCount(fetched)} thư` : `${formatCount(fetched)} / ${formatCount(total)} thư`
  const remaining = remainingMinutes ? ` · còn khoảng ${remainingMinutes} phút` : ''
  const percent = total === null ? null : total === 0 ? 100 : Math.round((fetched / total) * 100)
  return { text: `${count}${remaining}`, percent }
}
