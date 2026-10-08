// Turns the raw overview data (instants, counts, codes) into the Vietnamese text of the screen.
import { capitalize, methodLabel, type ProviderNameOf } from '@/shared/format'
import { calendarDaysBetween, formatClock, formatDayMonth, formatSince, localParts } from '@/shared/time/local'
import type { StatusTone } from '@/shared/ui/status'
import type {
  ActivityItem,
  InboxConversation,
  InboxSummary,
  OverviewAccount,
  RegistrationSummary,
  SyncActivity,
  TodayItem,
} from './overview.types'

export { formatCount, methodLabel, providerNameOf, type ProviderNameOf } from '@/shared/format'
/** A piece of a sentence; `{ strong }` is shown in bold. */
export type TextPart = string | { strong: string }
export type AccountStatusView =
  | { tone: StatusTone; label: string; progress?: number }
  | { tone: 'err'; detail: string; action: string }

export function greeting(date: Date, timeZone?: string): string {
  const { hour } = localParts(date, timeZone)
  if (hour >= 5 && hour < 11) {
    return 'Chào buổi sáng'
  }
  if (hour >= 11 && hour < 13) {
    return 'Chào buổi trưa'
  }
  if (hour >= 13 && hour < 18) {
    return 'Chào buổi chiều'
  }
  return 'Chào buổi tối'
}

const NUMBER_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười']

/** 0..10 as words ("hai"), bigger numbers as digits. */
export function numberWord(value: number): string {
  return NUMBER_WORDS[value] ?? String(value)
}

const needsAction = (account: OverviewAccount) => account.status === 'AUTH_EXPIRED' || account.status === 'ERROR'

export function accountSummary(accounts: OverviewAccount[], nameOf: ProviderNameOf): { normal: string; issue: string | null } {
  if (accounts.length === 0) {
    return { normal: 'Chưa kết nối tài khoản nào.', issue: null }
  }
  const working = accounts.filter((account) => account.status === 'CONNECTED').length
  const normal = working > 0
    ? `${capitalize(numberWord(working))} tài khoản đang chạy bình thường.`
    : 'Chưa có tài khoản nào chạy bình thường.'
  const issues = accounts.filter(needsAction)
  if (issues.length === 0) {
    return { normal, issue: null }
  }
  if (issues.length > 1) {
    return { normal, issue: `${issues.length} tài khoản cần xử lý` }
  }
  const [only] = issues
  const name = nameOf(only.provider)
  return { normal, issue: only.status === 'AUTH_EXPIRED' ? `${name} cần đăng nhập lại` : `${name} đang gặp lỗi` }
}

/** "3 · 1 cần xử lý" */
export function accountsHeader(accounts: OverviewAccount[]): string {
  const issues = accounts.filter(needsAction).length
  return issues > 0 ? `${accounts.length} · ${issues} cần xử lý` : String(accounts.length)
}

export function accountStatusView(account: OverviewAccount, now: Date, timeZone?: string): AccountStatusView {
  switch (account.status) {
    case 'CONNECTED':
      return account.syncProgress === null
        ? { tone: 'ok', label: 'Ổn định' }
        : { tone: 'warn', label: `${account.syncProgress}%`, progress: account.syncProgress }
    case 'DEGRADED':
      return { tone: 'warn', label: 'Có trục trặc' }
    case 'AUTH_EXPIRED':
      return {
        tone: 'err',
        detail: account.statusChangedAt
          ? `Quyền hết hạn từ ${formatSince(new Date(account.statusChangedAt), now, timeZone)}`
          : 'Quyền truy cập đã hết hạn',
        action: 'Đăng nhập lại',
      }
    case 'ERROR':
      return { tone: 'err', label: 'Đang lỗi' }
    case 'DISABLED':
      return { tone: 'off', label: 'Đã tắt' }
  }
}

export function awaitingText(count: number): string {
  return count > 0
    ? `${count} cuộc trò chuyện đang chờ bạn trả lời.`
    : 'Không có cuộc trò chuyện nào chờ bạn trả lời.'
}

/** Each source with its share of the unread messages, in whole percent. */
export function sourceShares(bySource: InboxSummary['bySource']) {
  const total = bySource.reduce((sum, source) => sum + source.unreadCount, 0)
  return bySource.map((source) => ({
    ...source,
    percent: total > 0 ? Math.round((source.unreadCount / total) * 100) : 0,
  }))
}

/** The part after the name: an email subject, or the chat's source and group size. */
export function conversationContext(conversation: InboxConversation, providerName: string): string {
  if (conversation.subject) {
    return conversation.subject
  }
  const group = conversation.memberCount ? `nhóm ${conversation.memberCount} người` : null
  return [providerName, group].filter(Boolean).join(' · ')
}

/** "4 việc · 1 lịch hẹn" */
export function todayCounts(items: TodayItem[]): string {
  const todos = items.filter((item) => item.kind !== 'EVENT').length
  const events = items.length - todos
  const parts = [todos > 0 ? `${todos} việc` : null, events > 0 ? `${events} lịch hẹn` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Trống'
}

/** How late an unfinished item is, or null when it is done or not due yet. */
export function overdueText(item: TodayItem, now: Date, timeZone?: string): string | null {
  const at = new Date(item.at)
  if (item.done || at >= now) {
    return null
  }
  const days = calendarDaysBetween(at, now, timeZone)
  return days >= 1 ? `Quá hạn ${days} ngày` : 'Quá giờ'
}

/** The time of an item due today, otherwise its date. */
export function itemTimeLabel(item: TodayItem, now: Date, timeZone?: string): string {
  const at = new Date(item.at)
  return calendarDaysBetween(at, now, timeZone) === 0 ? formatClock(at, timeZone) : formatDayMonth(at, timeZone)
}

const RECURRENCE_LABELS: Record<NonNullable<TodayItem['recurrence']>, string> = {
  DAILY: 'Hằng ngày',
  WEEKLY: 'Hằng tuần',
  MONTHLY: 'Hằng tháng',
  YEARLY: 'Hằng năm',
}

export function recurrenceLabel(recurrence: NonNullable<TodayItem['recurrence']>): string {
  return RECURRENCE_LABELS[recurrence]
}

/** Bar heights in percent of the busiest hour. */
export function barHeights(buckets: SyncActivity['buckets']): number[] {
  const busiest = Math.max(0, ...buckets.map((bucket) => bucket.messages))
  return buckets.map((bucket) => (busiest > 0 ? Math.round((bucket.messages / busiest) * 100) : 0))
}

export function healthText(source: SyncActivity['providers'][number], name: string, timeZone?: string): string {
  const time = source.since ? formatClock(new Date(source.since), timeZone) : null
  if (source.health === 'WARNING') {
    return time ? `${name} · chậm lúc ${time}` : `${name} · chậm`
  }
  if (source.health === 'ERROR') {
    return time ? `${name} · lỗi từ ${time}` : `${name} · lỗi`
  }
  return name
}

/** What the bar chart shows, for screen readers: errors first, then slow sources. */
export function syncAriaLabel(activity: SyncActivity, nameOf: ProviderNameOf, timeZone?: string): string {
  const describe = (source: SyncActivity['providers'][number], word: string) => {
    const hour = source.since ? ` lúc ${localParts(new Date(source.since), timeZone).hour} giờ` : ''
    return `${nameOf(source.provider)} ${word}${hour}`
  }
  const issues = [
    ...activity.providers.filter((source) => source.health === 'ERROR').map((source) => describe(source, 'lỗi')),
    ...activity.providers.filter((source) => source.health === 'WARNING').map((source) => describe(source, 'chậm')),
  ]
  const base = 'Số thư đồng bộ mỗi giờ trong 24 giờ qua.'
  return issues.length > 0 ? `${base} ${issues.join(', ')}.` : base
}

/** "15:00 hôm qua" */
export function axisStartLabel(start: string, now: Date, timeZone?: string): string {
  const date = new Date(start)
  const days = calendarDaysBetween(date, now, timeZone)
  const suffix = days === 1 ? ' hôm qua' : days > 1 ? ` ${formatDayMonth(date, timeZone)}` : ''
  return `${formatClock(date, timeZone)}${suffix}`
}

/** "may.forum · qua Zalo · 30/09" */
export function registrationMeta(latest: NonNullable<RegistrationSummary['latest']>, timeZone?: string): string {
  return `${latest.domain} · qua ${methodLabel(latest.method)} · ${formatDayMonth(new Date(latest.detectedAt), timeZone)}`
}

export function activityText(item: ActivityItem, nameOf: ProviderNameOf, timeZone?: string): TextPart[] {
  switch (item.kind) {
    case 'SYNC_RECOVERED':
      return [`${nameOf(item.provider)} đồng bộ lại sau ${item.downtimeMinutes} phút mất kết nối.`]
    case 'REGISTRATION_DETECTED':
      return ['Phát hiện đăng ký mới: ', { strong: item.siteName }, `, đăng nhập bằng ${methodLabel(item.method)}.`]
    case 'AUTH_EXPIRED':
      return [`Quyền truy cập ${nameOf(item.provider)} hết hạn lúc ${formatClock(new Date(item.at), timeZone)}.`]
    case 'ACCOUNT_CONNECTED':
      return [`Đã kết nối ${nameOf(item.provider)} ${item.externalAccountId}.`]
  }
}
