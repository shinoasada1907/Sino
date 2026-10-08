// Turns the raw inbox data (instants, counts, codes) into the Vietnamese text of the Hộp thư screens.
import type { ProviderNameOf } from '@/shared/format'
import {
  calendarDaysBetween,
  daysSinceMonday,
  formatClock,
  formatDayMonth,
  weekdayName,
  weekdayNumbered,
  weekdayShort,
} from '@/shared/time/local'
import type { ConversationItem, LinkedItem, LinkedKind, Member, Message } from './inbox.types'

export type InboxView = 'all' | 'unread' | 'reply' | 'attachments' | 'scheduled' | 'snoozed' | 'archived'
export interface InboxFilter {
  source: string | null
  view: InboxView
}
export type RowFlag = {
  kind: 'SCHEDULE_FAILED' | 'RESURFACED' | 'SCHEDULED' | LinkedKind
  tone: 'muted' | 'err'
  text: string
}

/** Where a conversation sorts: its last message, or when it came back from a snooze if that is later. */
export function sortTime(item: ConversationItem): number {
  const resurfaced = item.snooze?.resurfacedAt ? Date.parse(item.snooze.resurfacedAt) : 0
  return Math.max(Date.parse(item.lastMessageAt), resurfaced)
}

export function dayGroupLabel(at: Date, now: Date, timeZone?: string): string {
  const days = calendarDaysBetween(at, now, timeZone)
  if (days <= 0) {
    return 'HÔM NAY'
  }
  if (days === 1) {
    return 'HÔM QUA'
  }
  return days <= daysSinceMonday(now, timeZone) ? 'TUẦN NÀY' : 'TRƯỚC ĐÓ'
}

/** Newest first, in day groups. */
export function groupConversations(items: ConversationItem[], now: Date, timeZone?: string) {
  const groups: { label: string; items: ConversationItem[] }[] = []
  for (const item of [...items].sort((a, b) => sortTime(b) - sortTime(a))) {
    const label = dayGroupLabel(new Date(sortTime(item)), now, timeZone)
    const group = groups.at(-1)
    if (group?.label === label) {
      group.items.push(item)
    } else {
      groups.push({ label, items: [item] })
    }
  }
  return groups
}

/** The time of a row: the clock today and yesterday, the weekday this week, the date before. */
export function rowTime(item: ConversationItem, now: Date, timeZone?: string): string {
  const last = new Date(item.lastMessageAt)
  const days = calendarDaysBetween(last, now, timeZone)
  const groupDays = calendarDaysBetween(new Date(sortTime(item)), now, timeZone)
  if (days <= 1 && days === groupDays) {
    return formatClock(last, timeZone)
  }
  if (days === 1) {
    return 'Hôm qua'
  }
  if (days <= 0) {
    return formatClock(last, timeZone)
  }
  return days <= daysSinceMonday(now, timeZone) ? weekdayNumbered(last, timeZone) : formatDayMonth(last, timeZone)
}

/** "T4 07/10" for a whole day, "T7 03/10 17:00" otherwise. */
function dateLabel(at: Date, allDay: boolean, timeZone?: string): string {
  const day = `${weekdayShort(at, timeZone)} ${formatDayMonth(at, timeZone)}`
  return allDay ? day : `${day} ${formatClock(at, timeZone)}`
}

/** The clock today, otherwise "T7 03/10 08:00". */
function dayTime(at: Date, now: Date, timeZone?: string): string {
  return calendarDaysBetween(at, now, timeZone) === 0 ? formatClock(at, timeZone) : dateLabel(at, false, timeZone)
}

const LINKED_NAMES: Record<LinkedKind, string> = { TASK: 'Task', EVENT: 'Lịch hẹn', NOTE: 'Ghi chú' }

/**
 * The flag line of a row: a failed scheduled send first, then a snooze that ended, a scheduled reply, and the nearest
 * linked task or appointment (upcoming first); a note only when there is nothing else.
 */
export function rowFlag(item: ConversationItem, now: Date, timeZone?: string): RowFlag | null {
  if (item.scheduledSend?.failed) {
    return { kind: 'SCHEDULE_FAILED', tone: 'err', text: 'Thư hẹn giờ không gửi được' }
  }
  if (item.snooze?.resurfacedAt) {
    return { kind: 'RESURFACED', tone: 'muted', text: `Hiện lại theo hẹn · ${dayTime(new Date(item.snooze.resurfacedAt), now, timeZone)}` }
  }
  if (item.scheduledSend) {
    return { kind: 'SCHEDULED', tone: 'muted', text: `Hẹn gửi trả lời · ${dayTime(new Date(item.scheduledSend.at), now, timeZone)}` }
  }
  const timed = item.linked
    .filter((linked) => linked.at !== null)
    .map((linked) => ({ ...linked, time: Date.parse(linked.at!) }))
    .sort((a, b) => a.time - b.time)
  const nearest = timed.find((linked) => linked.time >= now.getTime()) ?? timed.at(-1)
  if (nearest) {
    const when = dateLabel(new Date(nearest.time), nearest.allDay, timeZone)
    return nearest.kind === 'TASK'
      ? { kind: 'TASK', tone: 'muted', text: `Task · hạn ${when}` }
      : { kind: nearest.kind, tone: 'muted', text: `${LINKED_NAMES[nearest.kind]} · ${when}` }
  }
  return item.linked.length > 0 ? { kind: 'NOTE', tone: 'muted', text: 'Ghi chú' } : null
}

/** "Hà: Con mua bánh…" in a group, the message alone otherwise. */
export function previewText(item: ConversationItem): string {
  return item.snippetFrom ? `${item.snippetFrom}: ${item.snippet}` : item.snippet
}

/** "Gmail", "Zalo · nhóm 6 người" */
export function sourceLabel(item: ConversationItem, nameOf: ProviderNameOf): string {
  const name = nameOf(item.provider)
  return item.memberCount ? `${name} · nhóm ${item.memberCount} người` : name
}

export function unreadLabel(count: number): string {
  return count > 0 ? `${count} chưa đọc` : 'Đã đọc hết'
}

const isSnoozed = (item: ConversationItem, now: Date) =>
  item.snooze?.until != null && Date.parse(item.snooze.until) > now.getTime()

const VIEW_TESTS: Record<Exclude<InboxView, 'snoozed' | 'archived'>, (item: ConversationItem) => boolean> = {
  all: () => true,
  unread: (item) => item.unreadCount > 0,
  reply: (item) => item.needsReply,
  attachments: (item) => item.hasAttachments,
  scheduled: (item) => item.scheduledSend !== null && !item.scheduledSend.failed,
}

/** The inbox hides archived and snoozed conversations; "Đang tạm ẩn" and "Đã lưu trữ" show only those. */
export function filterConversations(items: ConversationItem[], { source, view }: InboxFilter, now: Date): ConversationItem[] {
  return items.filter((item) => {
    if (source !== null && item.provider !== source) {
      return false
    }
    if (view === 'archived') {
      return item.archived
    }
    if (item.archived) {
      return false
    }
    if (view === 'snoozed') {
      return isSnoozed(item, now)
    }
    return !isSnoozed(item, now) && VIEW_TESTS[view](item)
  })
}

/** "1,4 MB", "86 KB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  const megabytes = (bytes / (1024 * 1024)).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${megabytes} MB`
}

/** "3 thư · 2 tệp" */
export function threadMeta(messages: Message[]): string {
  const mails = messages.filter((message) => message.kind === 'MESSAGE')
  const files = mails.reduce((sum, message) => sum + message.attachments.length, 0)
  return files > 0 ? `${mails.length} thư · ${files} tệp` : `${mails.length} thư`
}

/** "Gmail · an.nguyen@gmail.com", "Zalo · nhóm 6 người · qua +84 9•• ••• 218" */
export function threadSubtitle(item: ConversationItem, account: { externalAccountId: string }, nameOf: ProviderNameOf): string {
  return item.kind === 'EMAIL'
    ? `${nameOf(item.provider)} · ${account.externalAccountId}`
    : `${sourceLabel(item, nameOf)} · qua ${account.externalAccountId}`
}

/** The date of an email: in full when it is open ("09:41 hôm nay"), short when folded ("28/09"). */
export function mailTime(at: string, now: Date, timeZone: string | undefined, expanded: boolean): string {
  const date = new Date(at)
  const days = calendarDaysBetween(date, now, timeZone)
  const time = formatClock(date, timeZone)
  if (expanded) {
    return days <= 0 ? `${time} hôm nay` : days === 1 ? `${time} hôm qua` : `${formatDayMonth(date, timeZone)} · ${time}`
  }
  return days <= 0 ? time : days === 1 ? 'Hôm qua' : formatDayMonth(date, timeZone)
}

const STATUS_LABELS = { SENDING: 'Đang gửi', SENT: 'Đã gửi', SEEN: 'Đã xem', FAILED: 'Không gửi được' } as const

/** "08:24 · Đang gửi" under an own bubble (only own messages have a status), the time alone under the others. */
export function bubbleMeta(message: Message & { kind: 'MESSAGE' }, timeZone?: string): string {
  const time = formatClock(new Date(message.at), timeZone)
  return message.status ? `${time} · ${STATUS_LABELS[message.status]}` : time
}

/** A plain text body as paragraphs of lines (D-53). */
export function paragraphs(text: string): string[][] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split('\n'))
}

const PLACEHOLDERS = ['a', 'd', 'c', 'b'] as const

/** The placeholder picture of a group member follows their place in the group; anyone else gets the striped one. */
export function memberPlaceholder(name: string, members: Member[] | null): (typeof PLACEHOLDERS)[number] {
  const index = members?.findIndex((member) => member.name === name) ?? -1
  return index >= 0 ? PLACEHOLDERS[index % PLACEHOLDERS.length] : 'c'
}

/** The messages of a chat, each with the day line to draw above it when the day changes. */
export function withDayLines(messages: Message[], now: Date, timeZone?: string): { message: Message; dayLine: string | null }[] {
  return messages.map((message, index) => {
    const day = chatDayLabel(message.at, now, timeZone)
    const previous = index > 0 ? chatDayLabel(messages[index - 1].at, now, timeZone) : null
    return { message, dayLine: day === previous ? null : day }
  })
}

/** The day line of a chat: "HÔM NAY", "HÔM QUA", then "THỨ BA · 29/09". */
export function chatDayLabel(at: string, now: Date, timeZone?: string): string {
  const date = new Date(at)
  const days = calendarDaysBetween(date, now, timeZone)
  if (days <= 0) {
    return 'HÔM NAY'
  }
  return days === 1 ? 'HÔM QUA' : `${weekdayName(date, timeZone).toUpperCase()} · ${formatDayMonth(date, timeZone)}`
}

export function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  )
}

/** "18:00 hôm nay", otherwise "T2 09:00". */
function remindLabel(at: Date, now: Date, timeZone?: string): string {
  const time = formatClock(at, timeZone)
  return calendarDaysBetween(at, now, timeZone) === 0 ? `${time} hôm nay` : `${weekdayShort(at, timeZone)} ${time}`
}

/** The line of a linked chip: "hạn T4 07/10 · nhắc T2 09:00", "T5 08/10 14:00"; nothing for a note. */
export function linkedMeta(linked: LinkedItem, now: Date, timeZone?: string): string | null {
  if (linked.kind === 'NOTE' || linked.at === null) {
    return null
  }
  const when = dateLabel(new Date(linked.at), linked.allDay, timeZone)
  if (linked.kind === 'EVENT') {
    return when
  }
  return linked.remindAt ? `hạn ${when} · nhắc ${remindLabel(new Date(linked.remindAt), now, timeZone)}` : `hạn ${when}`
}

/** The line of a linked item in the info column: "TASK · T7 03/10 17:00 · NHẮC 18:00 HÔM NAY". */
export function linkedInfoSpec(linked: LinkedItem, now: Date, timeZone?: string): string {
  if (linked.kind === 'NOTE') {
    return linked.pinned ? 'GHI CHÚ · ĐÃ GHIM' : 'GHI CHÚ'
  }
  const parts = [linked.kind === 'TASK' ? 'Task' : 'Lịch hẹn']
  if (linked.at) {
    parts.push(dateLabel(new Date(linked.at), linked.allDay, timeZone))
  }
  if (linked.kind === 'TASK' && linked.remindAt) {
    parts.push(`nhắc ${remindLabel(new Date(linked.remindAt), now, timeZone)}`)
  }
  return parts.join(' · ').toUpperCase()
}
