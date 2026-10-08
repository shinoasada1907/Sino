import { describe, expect, it } from 'vitest'
import { providerNameOf } from '@/shared/format'
import type { AccountItem } from './accounts.types'
import {
  accessNote,
  accountActivityText,
  accountsHeadline,
  blockedNotice,
  channelHint,
  channelLabel,
  channelSummary,
  disconnectNote,
  disconnectPrompt,
  enabledChannelCount,
  filterAccounts,
  formatDuration,
  healthView,
  lastSyncLabel,
  latestSyncTime,
  mobileDisconnectNote,
  mobileSubtitle,
  needsAttention,
  reauthNotice,
  ribbonItems,
  scopeLabel,
  stampLabel,
  storedSince,
  syncRunsLabel,
  syncRunView,
  syncStatusView,
} from './format'

const TZ = 'Asia/Ho_Chi_Minh'
const now = new Date('2026-10-02T07:05:00Z') // Friday 14:05 in Vietnam
const nameOf = providerNameOf([
  { type: 'gmail', displayName: 'Gmail' },
  { type: 'zalo', displayName: 'Zalo' },
  { type: 'messenger', displayName: 'Messenger' },
])

function account(extra: Partial<AccountItem>): AccountItem {
  return {
    id: 'acc',
    provider: 'gmail',
    externalAccountId: 'an.nguyen@gmail.com',
    displayName: 'An Nguyễn',
    avatarUrl: null,
    status: 'CONNECTED',
    syncEnabled: true,
    lastSyncedAt: '2026-10-02T07:03:00Z',
    createdAt: '2026-09-29T13:05:00Z',
    syncProgress: null,
    statusChangedAt: null,
    access: { expiresAt: null, autoRenew: true, lastRenewedAt: null },
    storedMessages: 1284,
    syncIntervalMinutes: 15,
    channels: [
      { kind: 'INBOUND', available: true, enabled: true },
      { kind: 'SEND', available: true, enabled: true },
      { kind: 'ATTACHMENTS', available: true, enabled: true },
      { kind: 'CONTACTS', available: false, enabled: false },
    ],
    ...extra,
  }
}

const gmail = account({ id: 'acc-gmail' })
const zalo = account({
  id: 'acc-zalo',
  provider: 'zalo',
  externalAccountId: '+84 9•• ••• 218',
  syncProgress: 64,
  access: { expiresAt: '2026-10-07T07:05:00Z', autoRenew: false, lastRenewedAt: null },
})
const messenger = account({
  id: 'acc-messenger',
  provider: 'messenger',
  externalAccountId: 'an.nguyen.92',
  status: 'AUTH_EXPIRED',
  lastSyncedAt: '2026-10-01T14:04:00Z',
  statusChangedAt: '2026-10-01T14:04:00Z',
  access: { expiresAt: '2026-10-01T14:04:00Z', autoRenew: false, lastRenewedAt: null },
  storedMessages: 1204,
})
const all = [gmail, zalo, messenger]

describe('sync status and last sync', () => {
  it('names the sync state of each account', () => {
    expect(syncStatusView(gmail)).toEqual({ tone: 'ok', label: 'Đang hoạt động' })
    expect(syncStatusView(zalo)).toEqual({ tone: 'warn', label: 'Đang đồng bộ · 64%' })
    expect(syncStatusView(messenger)).toEqual({ tone: 'off', label: 'Tạm dừng' })
    expect(syncStatusView(account({ status: 'DISABLED' }))).toEqual({ tone: 'off', label: 'Đã tắt' })
    expect(syncStatusView(account({ status: 'ERROR' }))).toEqual({ tone: 'err', label: 'Lỗi đồng bộ' })
  })

  it('says when the last sync was: minutes today, then yesterday or the date with the time', () => {
    expect(lastSyncLabel('2026-10-02T07:03:00Z', now, TZ)).toBe('2 phút trước')
    expect(lastSyncLabel('2026-10-02T07:04:40Z', now, TZ)).toBe('vừa xong')
    expect(lastSyncLabel('2026-10-01T14:04:00Z', now, TZ)).toBe('Hôm qua, 21:04')
    expect(lastSyncLabel('2026-09-28T02:00:00Z', now, TZ)).toBe('28/09, 09:00')
    expect(lastSyncLabel(null, now, TZ)).toBe('Chưa đồng bộ')
  })

  it('gives the time of the most recent sync', () => {
    expect(latestSyncTime(all, TZ)).toBe('14:03')
    expect(latestSyncTime([account({ lastSyncedAt: null })], TZ)).toBeNull()
  })
})

describe('health', () => {
  it('tells how long the access keeps working', () => {
    expect(healthView(gmail, now)).toEqual({ tone: 'ok', label: 'Tốt · quyền tự gia hạn' })
    expect(healthView(zalo, now)).toEqual({ tone: 'warn', label: 'Quyền hết hạn sau 5 ngày' })
    expect(healthView(messenger, now)).toEqual({ tone: 'err', label: 'Cần đăng nhập lại' })
    expect(healthView(account({ access: { expiresAt: '2026-11-30T00:00:00Z', autoRenew: false, lastRenewedAt: null } }), now)).toEqual({
      tone: 'ok',
      label: 'Tốt',
    })
    expect(healthView(account({ access: { expiresAt: '2026-10-02T09:05:00Z', autoRenew: false, lastRenewedAt: null } }), now).label).toBe(
      'Quyền hết hạn sau 1 ngày',
    )
    expect(healthView(account({ access: { expiresAt: '2026-10-02T07:00:00Z', autoRenew: false, lastRenewedAt: null } }), now)).toEqual({
      tone: 'err',
      label: 'Quyền đã hết hạn',
    })
  })
})

describe('summaries', () => {
  it('heads the page and the mobile header', () => {
    expect(accountsHeadline(3)).toBe('TÀI KHOẢN · 3 ĐÃ KẾT NỐI')
    expect(mobileSubtitle(all)).toBe('3 TÀI KHOẢN · 1 CẦN XỬ LÝ')
    expect(mobileSubtitle([gmail])).toBe('1 TÀI KHOẢN')
  })

  it('counts the accounts by state for the ribbon, leaving out empty states', () => {
    expect(ribbonItems(all)).toEqual([
      { tone: 'ok', label: '1 ổn định' },
      { tone: 'warn', label: '1 đang đồng bộ' },
      { tone: 'err', label: '1 cần đăng nhập lại' },
    ])
    expect(
      ribbonItems([gmail, account({ status: 'DEGRADED' }), account({ status: 'ERROR' }), account({ status: 'DISABLED' })]),
    ).toEqual([
      { tone: 'ok', label: '1 ổn định' },
      { tone: 'warn', label: '1 có trục trặc' },
      { tone: 'err', label: '1 đang lỗi' },
      { tone: 'off', label: '1 đã tắt' },
    ])
  })

  it('warns about an account to sign in to again', () => {
    expect(reauthNotice(messenger, nameOf, now, TZ)).toEqual({
      title: 'Messenger an.nguyen.92 cần đăng nhập lại',
      detail: 'Quyền truy cập hết hạn lúc 21:04 hôm qua. Tin nhắn mới tạm dừng; 1.204 tin đã lưu vẫn còn.',
    })
    expect(reauthNotice(account({ status: 'AUTH_EXPIRED', statusChangedAt: null, storedMessages: 12 }), nameOf, now, TZ).detail).toBe(
      'Quyền truy cập đã hết hạn. Thư mới tạm dừng; 12 thư đã lưu vẫn còn.',
    )
  })

  it('knows which accounts need attention', () => {
    expect(all.filter(needsAttention).map((a) => a.id)).toEqual(['acc-messenger'])
    expect(needsAttention(account({ status: 'ERROR' }))).toBe(true)
  })
})

describe('search and filter', () => {
  it('finds accounts without caring about case or Vietnamese marks', () => {
    expect(filterAccounts(all, { query: 'NGUYEN.92', filter: 'all' }, nameOf).map((a) => a.id)).toEqual(['acc-messenger'])
    expect(filterAccounts(all, { query: 'nguyễn', filter: 'all' }, nameOf)).toHaveLength(3)
    expect(filterAccounts(all, { query: 'zalo', filter: 'all' }, nameOf).map((a) => a.id)).toEqual(['acc-zalo'])
    expect(filterAccounts(all, { query: '  ', filter: 'all' }, nameOf)).toHaveLength(3)
  })

  it('keeps only the accounts that need attention', () => {
    expect(filterAccounts(all, { query: '', filter: 'attention' }, nameOf).map((a) => a.id)).toEqual(['acc-messenger'])
    expect(filterAccounts(all, { query: 'gmail', filter: 'attention' }, nameOf)).toEqual([])
  })
})

describe('channels', () => {
  it('counts the channels that are on', () => {
    expect(enabledChannelCount(gmail)).toBe(3)
    expect(channelSummary(gmail)).toBe('3 bật · 1 tắt')
    const revoked = account({ channels: [{ kind: 'SEND', available: false, enabled: true }] })
    expect(enabledChannelCount(revoked)).toBe(0)
  })

  it('names channels as emails for Gmail and as messages for chats', () => {
    expect(channelLabel('INBOUND', 'gmail')).toBe('Thư đến')
    expect(channelLabel('SEND', 'gmail')).toBe('Gửi thư')
    expect(channelLabel('INBOUND', 'messenger')).toBe('Tin nhắn đến')
    expect(channelLabel('SEND', 'zalo')).toBe('Gửi tin')
    expect(channelLabel('ATTACHMENTS', 'zalo')).toBe('Tệp đính kèm')
    expect(channelLabel('CONTACTS', 'gmail')).toBe('Danh bạ')
  })

  it('explains each channel', () => {
    const [inbound, send, attachments, contacts] = gmail.channels
    expect(channelHint(inbound, gmail, now, TZ)).toBe('Đồng bộ mỗi 15 phút · 1.284 thư')
    expect(channelHint(inbound, account({ syncIntervalMinutes: null }), now, TZ)).toBe('1.284 thư đã lưu')
    expect(channelHint(send, gmail, now, TZ)).toBe('Trả lời từ Sino bằng địa chỉ này')
    expect(channelHint(send, zalo, now, TZ)).toBe('Trả lời từ Sino bằng tài khoản này')
    expect(channelHint(attachments, gmail, now, TZ)).toBe('Chỉ lưu tên và dung lượng, tải về khi bạn mở')
    expect(channelHint(contacts, gmail, now, TZ)).toBe('Gợi ý người nhận khi soạn thư · cần thêm quyền')
    expect(channelHint(inbound, messenger, now, TZ)).toBe('Lần cuối 21:04 hôm qua')
  })
})

describe('detail sections', () => {
  it('labels scopes, showing an unknown code as it is', () => {
    expect(scopeLabel('gmail.readonly')).toBe('Đọc thư và nhãn')
    expect(scopeLabel('gmail.send')).toBe('Gửi thư thay bạn')
    expect(scopeLabel('weird.scope')).toBe('weird.scope')
  })

  it('describes a sync run', () => {
    expect(syncRunView({ at: '2026-10-02T07:03:00Z', result: 'OK', messages: 12, durationMs: 3100 }, TZ)).toEqual({
      time: '14:03',
      tone: 'ok',
      result: 'Xong',
      messages: '+12',
      duration: '3,1 s',
    })
    expect(syncRunView({ at: '2026-10-02T05:01:00Z', result: 'SLOW', messages: 0, durationMs: 18_400 }, TZ)).toMatchObject({
      tone: 'warn',
      result: 'Chậm',
      messages: '0',
    })
    expect(formatDuration(950)).toBe('1,0 s')
  })

  it('notes how the access is renewed', () => {
    expect(accessNote({ expiresAt: null, autoRenew: true, lastRenewedAt: '2026-10-02T06:50:00Z' }, now, TZ)).toBe(
      'Quyền tự gia hạn. Lần gần nhất lúc 13:50.',
    )
    expect(accessNote({ expiresAt: null, autoRenew: true, lastRenewedAt: null }, now, TZ)).toBe('Quyền tự gia hạn.')
    expect(accessNote(zalo.access, now, TZ)).toBe('Quyền hết hạn ngày 07/10/2026.')
    expect(accessNote(messenger.access, now, TZ)).toBe('Quyền hết hạn lúc 21:04 hôm qua.')
    expect(accessNote({ expiresAt: null, autoRenew: false, lastRenewedAt: null }, now, TZ)).toBeNull()
  })

  it('stamps a time with its day', () => {
    expect(stampLabel('2026-10-01T02:12:00Z', TZ)).toBe('01/10 · 09:12')
  })

  it('heads the sync history with its day', () => {
    expect(syncRunsLabel([{ at: '2026-10-02T07:03:00Z', result: 'OK', messages: 1, durationMs: 1000 }], now, TZ)).toBe('hôm nay')
    expect(syncRunsLabel([{ at: '2026-10-01T07:03:00Z', result: 'OK', messages: 1, durationMs: 1000 }], now, TZ)).toBe('01/10')
    expect(syncRunsLabel([], now, TZ)).toBeNull()
  })

  it('tells on mobile what an expired account blocks', () => {
    expect(blockedNotice(messenger, nameOf)).toEqual({
      title: 'Sino không đọc và gửi tin Messenger được',
      detail: 'Tin nhắn mới tạm dừng; 1.204 tin đã lưu vẫn còn. Đăng nhập lại để nhận tiếp.',
    })
    expect(blockedNotice(account({ status: 'AUTH_EXPIRED' }), nameOf).title).toBe('Sino không đọc và gửi thư Gmail được')
  })

  it('says since when messages are stored', () => {
    expect(storedSince(messenger, TZ)).toBe('TIN NHẮN · TỪ 29/09')
    expect(storedSince(gmail, TZ)).toBe('THƯ · TỪ 29/09')
  })

  it('asks before disconnecting, with the stored messages to keep or delete', () => {
    expect(disconnectPrompt(messenger, nameOf)).toEqual({
      title: 'Ngắt kết nối Messenger?',
      text: 'Sino sẽ dừng đồng bộ và xóa quyền truy cập đã cấp. 1.204 tin nhắn đã lưu vẫn được giữ lại, bạn có thể xóa chúng trong phần Quyền riêng tư.',
      deleteLabel: 'Xóa luôn tin nhắn đã lưu',
    })
    expect(disconnectPrompt(gmail, nameOf).deleteLabel).toBe('Xóa luôn thư đã lưu')
    expect(mobileDisconnectNote(messenger, nameOf)).toBe(
      'Ngắt kết nối sẽ xóa quyền truy cập Sino đang giữ. Task và ghi chú tạo từ tin Messenger vẫn còn.',
    )
    expect(mobileDisconnectNote(gmail, nameOf)).toContain('tạo từ thư Gmail')
  })

  it('says what disconnecting keeps', () => {
    expect(disconnectNote(gmail)).toBe(
      'Sino dừng đồng bộ và xóa quyền truy cập đã cấp. 1.284 thư đã lưu được giữ lại cho tới khi bạn xóa trong Quyền riêng tư.',
    )
    expect(disconnectNote(messenger)).toContain('1.204 tin nhắn đã lưu')
  })

  it('tells the account activity in sentences', () => {
    expect(accountActivityText({ id: 'a', at: '', kind: 'SCOPE_GRANTED', scope: 'gmail.send' }, gmail, nameOf)).toBe(
      'Bạn cấp thêm quyền gửi thư.',
    )
    expect(accountActivityText({ id: 'a', at: '', kind: 'SCOPE_GRANTED', scope: 'weird.scope' }, gmail, nameOf)).toBe(
      'Bạn cấp thêm quyền weird.scope.',
    )
    expect(accountActivityText({ id: 'b', at: '', kind: 'SITES_DETECTED', count: 21, method: 'google' }, gmail, nameOf)).toBe(
      'Phát hiện 21 website bạn đăng nhập bằng tài khoản Google này.',
    )
    expect(
      accountActivityText({ id: 'c', at: '', kind: 'ACCOUNT_CONNECTED', initialMessages: 1180, durationMinutes: 4 }, gmail, nameOf),
    ).toBe('Kết nối tài khoản. Lần đồng bộ đầu lấy 1.180 thư trong 4 phút.')
    expect(accountActivityText({ id: 'd', at: '', kind: 'AUTH_EXPIRED' }, messenger, nameOf)).toBe('Quyền truy cập Messenger hết hạn.')
  })
})
