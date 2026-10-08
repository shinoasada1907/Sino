// Turns the raw account data (instants, counts, codes) into the Vietnamese text of the Tài khoản screens.
import { foldText, formatCount, methodLabel, type ProviderNameOf } from '@/shared/format'
import { calendarDaysBetween, formatClock, formatDate, formatDayMonth, formatSince } from '@/shared/time/local'
import { formatAgo } from '@/shared/time/relative'
import type { StatusTone } from '@/shared/ui/status'
import type { AccountActivity, AccountItem, ChannelKind, SyncRun } from './accounts.types'

export type ToneLabel = { tone: StatusTone; label: string }
export type AccountFilter = 'all' | 'attention'
type Channel = AccountItem['channels'][number]

const DAY = 86_400_000
const SOON_DAYS = 7

/** Email accounts talk about "thư", chat accounts about "tin nhắn". */
export const isMail = (provider: string) => provider === 'gmail'

export const needsAttention = (account: AccountItem) => account.status === 'AUTH_EXPIRED' || account.status === 'ERROR'

/** The "Đồng bộ" column: is data coming in. */
export function syncStatusView(account: AccountItem): ToneLabel {
  switch (account.status) {
    case 'CONNECTED':
      return account.syncProgress === null
        ? { tone: 'ok', label: 'Đang hoạt động' }
        : { tone: 'warn', label: `Đang đồng bộ · ${account.syncProgress}%` }
    case 'DEGRADED':
      return { tone: 'warn', label: 'Có trục trặc' }
    case 'AUTH_EXPIRED':
      return { tone: 'off', label: 'Tạm dừng' }
    case 'ERROR':
      return { tone: 'err', label: 'Lỗi đồng bộ' }
    case 'DISABLED':
      return { tone: 'off', label: 'Đã tắt' }
  }
}

/** "2 phút trước" today, "Hôm qua, 21:04", or "28/09, 09:00". */
export function lastSyncLabel(at: string | null, now: Date, timeZone?: string): string {
  if (at === null) {
    return 'Chưa đồng bộ'
  }
  const date = new Date(at)
  const days = calendarDaysBetween(date, now, timeZone)
  if (days <= 0) {
    return formatAgo(date, now)
  }
  const time = formatClock(date, timeZone)
  return days === 1 ? `Hôm qua, ${time}` : `${formatDayMonth(date, timeZone)}, ${time}`
}

/** The clock time of the most recent sync of any account, or null when none has synced. */
export function latestSyncTime(accounts: AccountItem[], timeZone?: string): string | null {
  const times = accounts.flatMap((account) => (account.lastSyncedAt ? [new Date(account.lastSyncedAt).getTime()] : []))
  return times.length > 0 ? formatClock(new Date(Math.max(...times)), timeZone) : null
}

/** The "Sức khỏe" column: how long the access keeps working. */
export function healthView(account: AccountItem, now: Date): ToneLabel {
  if (account.status === 'AUTH_EXPIRED') {
    return { tone: 'err', label: 'Cần đăng nhập lại' }
  }
  const { autoRenew, expiresAt } = account.access
  if (autoRenew) {
    return { tone: 'ok', label: 'Tốt · quyền tự gia hạn' }
  }
  if (expiresAt === null) {
    return { tone: 'ok', label: 'Tốt' }
  }
  const left = new Date(expiresAt).getTime() - now.getTime()
  if (left <= 0) {
    return { tone: 'err', label: 'Quyền đã hết hạn' }
  }
  const days = Math.ceil(left / DAY)
  return days <= SOON_DAYS ? { tone: 'warn', label: `Quyền hết hạn sau ${days} ngày` } : { tone: 'ok', label: 'Tốt' }
}

/** "TÀI KHOẢN · 3 ĐÃ KẾT NỐI" */
export function accountsHeadline(count: number): string {
  return `TÀI KHOẢN · ${count} ĐÃ KẾT NỐI`
}

/** "3 TÀI KHOẢN · 1 CẦN XỬ LÝ" */
export function mobileSubtitle(accounts: AccountItem[]): string {
  const issues = accounts.filter(needsAttention).length
  return issues > 0 ? `${accounts.length} TÀI KHOẢN · ${issues} CẦN XỬ LÝ` : `${accounts.length} TÀI KHOẢN`
}

const RIBBON: { tone: StatusTone; word: string; test: (account: AccountItem) => boolean }[] = [
  { tone: 'ok', word: 'ổn định', test: (a) => a.status === 'CONNECTED' && a.syncProgress === null },
  { tone: 'warn', word: 'đang đồng bộ', test: (a) => a.status === 'CONNECTED' && a.syncProgress !== null },
  { tone: 'warn', word: 'có trục trặc', test: (a) => a.status === 'DEGRADED' },
  { tone: 'err', word: 'cần đăng nhập lại', test: (a) => a.status === 'AUTH_EXPIRED' },
  { tone: 'err', word: 'đang lỗi', test: (a) => a.status === 'ERROR' },
  { tone: 'off', word: 'đã tắt', test: (a) => a.status === 'DISABLED' },
]

/** The summary ribbon: one item per state that has accounts. */
export function ribbonItems(accounts: AccountItem[]): ToneLabel[] {
  return RIBBON.flatMap(({ tone, word, test }) => {
    const count = accounts.filter(test).length
    return count > 0 ? [{ tone, label: `${count} ${word}` }] : []
  })
}

/** The alert above the table for an account whose access expired. */
export function reauthNotice(account: AccountItem, nameOf: ProviderNameOf, now: Date, timeZone?: string) {
  const when = account.statusChangedAt
    ? `Quyền truy cập hết hạn lúc ${formatSince(new Date(account.statusChangedAt), now, timeZone)}.`
    : 'Quyền truy cập đã hết hạn.'
  const [item, short] = isMail(account.provider) ? ['Thư', 'thư'] : ['Tin nhắn', 'tin']
  return {
    title: `${nameOf(account.provider)} ${account.externalAccountId} cần đăng nhập lại`,
    detail: `${when} ${item} mới tạm dừng; ${formatCount(account.storedMessages)} ${short} đã lưu vẫn còn.`,
  }
}

/** Search ignores case and Vietnamese marks; "Cần xử lý" keeps the accounts that need attention. */
export function filterAccounts(
  accounts: AccountItem[],
  { query, filter }: { query: string; filter: AccountFilter },
  nameOf: ProviderNameOf,
): AccountItem[] {
  const needle = foldText(query.trim())
  return accounts.filter((account) => {
    if (filter === 'attention' && !needsAttention(account)) {
      return false
    }
    const haystack = foldText(`${account.externalAccountId} ${account.displayName} ${nameOf(account.provider)}`)
    return haystack.includes(needle)
  })
}

/** Channels that work and are on; the "Dịch vụ" column. */
export function enabledChannelCount(account: AccountItem): number {
  return account.channels.filter((channel) => channel.available && channel.enabled).length
}

/** "3 bật · 1 tắt" */
export function channelSummary(account: AccountItem): string {
  const on = enabledChannelCount(account)
  return `${on} bật · ${account.channels.length - on} tắt`
}

export function channelLabel(kind: ChannelKind, provider: string): string {
  const mail = isMail(provider)
  switch (kind) {
    case 'INBOUND':
      return mail ? 'Thư đến' : 'Tin nhắn đến'
    case 'SEND':
      return mail ? 'Gửi thư' : 'Gửi tin'
    case 'ATTACHMENTS':
      return 'Tệp đính kèm'
    case 'CONTACTS':
      return 'Danh bạ'
  }
}

/** The line under a channel name; a paused inbound channel tells when it last synced. */
export function channelHint(channel: Channel, account: AccountItem, now: Date, timeZone?: string): string {
  const mail = isMail(account.provider)
  const hint = (() => {
    switch (channel.kind) {
      case 'INBOUND': {
        if (account.status === 'AUTH_EXPIRED' && account.lastSyncedAt) {
          return `Lần cuối ${formatSince(new Date(account.lastSyncedAt), now, timeZone)}`
        }
        const stored = `${formatCount(account.storedMessages)} ${mail ? 'thư' : 'tin nhắn'}`
        return account.syncIntervalMinutes === null
          ? `${stored} đã lưu`
          : `Đồng bộ mỗi ${account.syncIntervalMinutes} phút · ${stored}`
      }
      case 'SEND':
        return mail ? 'Trả lời từ Sino bằng địa chỉ này' : 'Trả lời từ Sino bằng tài khoản này'
      case 'ATTACHMENTS':
        return 'Chỉ lưu tên và dung lượng, tải về khi bạn mở'
      case 'CONTACTS':
        return mail ? 'Gợi ý người nhận khi soạn thư' : 'Gợi ý người nhận khi soạn tin'
    }
  })()
  return channel.available ? hint : `${hint} · cần thêm quyền`
}

/** The line under the scopes: how the access is renewed, or when it expires. */
export function accessNote(access: AccountItem['access'], now: Date, timeZone?: string): string | null {
  if (access.autoRenew) {
    return access.lastRenewedAt
      ? `Quyền tự gia hạn. Lần gần nhất lúc ${formatSince(new Date(access.lastRenewedAt), now, timeZone)}.`
      : 'Quyền tự gia hạn.'
  }
  if (access.expiresAt === null) {
    return null
  }
  const expires = new Date(access.expiresAt)
  return expires > now
    ? `Quyền hết hạn ngày ${formatDate(expires, timeZone)}.`
    : `Quyền hết hạn lúc ${formatSince(expires, now, timeZone)}.`
}

const SCOPES: Record<string, { label: string; granted: string }> = {
  'gmail.readonly': { label: 'Đọc thư và nhãn', granted: 'đọc thư' },
  'gmail.send': { label: 'Gửi thư thay bạn', granted: 'gửi thư' },
  'gmail.modify': { label: 'Xóa thư, đổi cài đặt Gmail', granted: 'xóa thư và đổi cài đặt Gmail' },
  'userinfo.email': { label: 'Xem địa chỉ email', granted: 'xem địa chỉ email' },
}

/** A scope code in words; an unknown code is shown as it is. */
export function scopeLabel(code: string): string {
  return SCOPES[code]?.label ?? code
}

const RUN_RESULTS: Record<SyncRun['result'], { tone: StatusTone; label: string }> = {
  OK: { tone: 'ok', label: 'Xong' },
  SLOW: { tone: 'warn', label: 'Chậm' },
  FAILED: { tone: 'err', label: 'Lỗi' },
}

/** "3,1 s" */
export function formatDuration(ms: number): string {
  return `${(ms / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
}

/** One row of "Lịch sử đồng bộ". */
export function syncRunView(run: SyncRun, timeZone?: string) {
  const { tone, label } = RUN_RESULTS[run.result]
  return {
    time: formatClock(new Date(run.at), timeZone),
    tone,
    result: label,
    messages: run.messages > 0 ? `+${formatCount(run.messages)}` : '0',
    duration: formatDuration(run.durationMs),
  }
}

/** "01/10 · 09:12" */
export function stampLabel(at: string, timeZone?: string): string {
  const date = new Date(at)
  return `${formatDayMonth(date, timeZone)} · ${formatClock(date, timeZone)}`
}

/** What happens to the stored messages when the account is disconnected. */
export function disconnectNote(account: AccountItem): string {
  const stored = `${formatCount(account.storedMessages)} ${isMail(account.provider) ? 'thư' : 'tin nhắn'}`
  return `Sino dừng đồng bộ và xóa quyền truy cập đã cấp. ${stored} đã lưu được giữ lại cho tới khi bạn xóa trong Quyền riêng tư.`
}

export function accountActivityText(item: AccountActivity, account: AccountItem, nameOf: ProviderNameOf): string {
  switch (item.kind) {
    case 'SCOPE_GRANTED':
      return `Bạn cấp thêm quyền ${SCOPES[item.scope]?.granted ?? item.scope}.`
    case 'SITES_DETECTED':
      return `Phát hiện ${item.count} website bạn đăng nhập bằng tài khoản ${methodLabel(item.method)} này.`
    case 'ACCOUNT_CONNECTED':
      return `Kết nối tài khoản. Lần đồng bộ đầu lấy ${formatCount(item.initialMessages)} ${isMail(account.provider) ? 'thư' : 'tin nhắn'} trong ${item.durationMinutes} phút.`
    case 'AUTH_EXPIRED':
      return `Quyền truy cập ${nameOf(account.provider)} hết hạn.`
  }
}


/** The day above "Lịch sử đồng bộ": "hôm nay" when the newest run is today, otherwise its date. */
export function syncRunsLabel(runs: SyncRun[], now: Date, timeZone?: string): string | null {
  if (runs.length === 0) {
    return null
  }
  const newest = new Date(runs[0].at)
  return calendarDaysBetween(newest, now, timeZone) === 0 ? 'hôm nay' : formatDayMonth(newest, timeZone)
}

/** The box on the mobile detail of an account whose access expired. */
export function blockedNotice(account: AccountItem, nameOf: ProviderNameOf) {
  const [item, short] = isMail(account.provider) ? ['Thư', 'thư'] : ['Tin nhắn', 'tin']
  return {
    title: `Sino không đọc và gửi ${short} ${nameOf(account.provider)} được`,
    detail: `${item} mới tạm dừng; ${formatCount(account.storedMessages)} ${short} đã lưu vẫn còn. Đăng nhập lại để nhận tiếp.`,
  }
}

/** "TIN NHẮN · TỪ 14/09" */
export function storedSince(account: AccountItem, timeZone?: string): string {
  return `${isMail(account.provider) ? 'THƯ' : 'TIN NHẮN'} · TỪ ${formatDayMonth(new Date(account.createdAt), timeZone)}`
}

/** The disconnect dialog: its question, what happens to the stored messages, and the switch to delete them. */
export function disconnectPrompt(account: AccountItem, nameOf: ProviderNameOf) {
  const noun = isMail(account.provider) ? 'thư' : 'tin nhắn'
  return {
    title: `Ngắt kết nối ${nameOf(account.provider)}?`,
    text: `Sino sẽ dừng đồng bộ và xóa quyền truy cập đã cấp. ${formatCount(account.storedMessages)} ${noun} đã lưu vẫn được giữ lại, bạn có thể xóa chúng trong phần Quyền riêng tư.`,
    deleteLabel: `Xóa luôn ${noun} đã lưu`,
  }
}

/** The line under the disconnect button on mobile. */
export function mobileDisconnectNote(account: AccountItem, nameOf: ProviderNameOf): string {
  const short = isMail(account.provider) ? 'thư' : 'tin'
  return `Ngắt kết nối sẽ xóa quyền truy cập Sino đang giữ. Task và ghi chú tạo từ ${short} ${nameOf(account.provider)} vẫn còn.`
}
