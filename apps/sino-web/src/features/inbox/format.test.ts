import { describe, expect, it } from 'vitest'
import { providerNameOf } from '@/shared/format'
import type { ConversationItem, LinkedItem, Message } from './inbox.types'
import {
  bubbleMeta,
  chatDayLabel,
  dayGroupLabel,
  filterConversations,
  firstLine,
  formatFileSize,
  groupConversations,
  linkedInfoSpec,
  linkedMeta,
  mailTime,
  memberPlaceholder,
  paragraphs,
  previewText,
  rowFlag,
  rowTime,
  sourceLabel,
  threadMeta,
  threadSubtitle,
  unreadLabel,
  withDayLines,
} from './format'

const TZ = 'Asia/Ho_Chi_Minh'
const now = new Date('2026-10-02T07:05:00Z') // Friday 14:05 in Vietnam
const vn = (time: string) => new Date(`${time}+07:00`).toISOString()
const nameOf = providerNameOf([
  { type: 'gmail', displayName: 'Gmail' },
  { type: 'zalo', displayName: 'Zalo' },
  { type: 'messenger', displayName: 'Messenger' },
])

function item(extra: Partial<ConversationItem>): ConversationItem {
  return {
    id: 'c',
    accountId: 'acc-gmail',
    provider: 'gmail',
    kind: 'EMAIL',
    title: 'Trần Minh Anh',
    subject: 'Hợp đồng',
    memberCount: null,
    snippetFrom: null,
    snippet: 'Em gửi lại bản đã sửa.',
    lastMessageAt: vn('2026-10-02T09:41'),
    unreadCount: 0,
    needsReply: false,
    hasAttachments: false,
    archived: false,
    snooze: null,
    scheduledSend: null,
    linked: [],
    ...extra,
  }
}

describe('days and times of the list', () => {
  it('groups by today, yesterday, this week and before', () => {
    expect(dayGroupLabel(new Date(vn('2026-10-02T09:41')), now, TZ)).toBe('HÔM NAY')
    expect(dayGroupLabel(new Date(vn('2026-10-01T21:02')), now, TZ)).toBe('HÔM QUA')
    expect(dayGroupLabel(new Date(vn('2026-09-29T09:12')), now, TZ)).toBe('TUẦN NÀY')
    expect(dayGroupLabel(new Date(vn('2026-09-28T00:10')), now, TZ)).toBe('TUẦN NÀY')
    expect(dayGroupLabel(new Date(vn('2026-09-27T23:50')), now, TZ)).toBe('TRƯỚC ĐÓ')
  })

  it('sorts newest first, a resurfaced conversation by when it came back', () => {
    const contract = item({ id: 'contract', lastMessageAt: vn('2026-10-02T09:41') })
    const run = item({
      id: 'run',
      lastMessageAt: vn('2026-10-01T18:47'),
      snooze: { until: vn('2026-10-02T14:00'), resurfacedAt: vn('2026-10-02T14:00') },
    })
    const power = item({ id: 'power', lastMessageAt: vn('2026-09-29T09:12') })
    const groups = groupConversations([power, contract, run], now, TZ)
    expect(groups.map((group) => [group.label, group.items.map((entry) => entry.id)])).toEqual([
      ['HÔM NAY', ['run', 'contract']],
      ['TUẦN NÀY', ['power']],
    ])
  })

  it('shows the time today and yesterday, the weekday this week, the date before', () => {
    expect(rowTime(item({ lastMessageAt: vn('2026-10-02T09:41') }), now, TZ)).toBe('09:41')
    expect(rowTime(item({ lastMessageAt: vn('2026-10-01T21:02') }), now, TZ)).toBe('21:02')
    expect(rowTime(item({ lastMessageAt: vn('2026-09-29T09:12') }), now, TZ)).toBe('Thứ 3')
    expect(rowTime(item({ lastMessageAt: vn('2026-09-27T09:12') }), now, TZ)).toBe('27/09')
    const resurfaced = item({ lastMessageAt: vn('2026-10-01T18:47'), snooze: { until: null, resurfacedAt: vn('2026-10-02T14:00') } })
    expect(rowTime(resurfaced, now, TZ)).toBe('Hôm qua')
  })
})

describe('the flag line of a row', () => {
  it('puts a failed scheduled send first, in red', () => {
    expect(rowFlag(item({ scheduledSend: { at: vn('2026-10-01T21:00'), failed: true } }), now, TZ)).toEqual({
      kind: 'SCHEDULE_FAILED',
      tone: 'err',
      text: 'Thư hẹn giờ không gửi được',
    })
  })

  it('says when a snoozed conversation came back, then a scheduled reply', () => {
    expect(rowFlag(item({ snooze: { until: null, resurfacedAt: vn('2026-10-02T14:00') } }), now, TZ)).toMatchObject({
      kind: 'RESURFACED',
      text: 'Hiện lại theo hẹn · 14:00',
    })
    expect(rowFlag(item({ scheduledSend: { at: vn('2026-10-03T08:00'), failed: false } }), now, TZ)).toMatchObject({
      kind: 'SCHEDULED',
      tone: 'muted',
      text: 'Hẹn gửi trả lời · T7 03/10 08:00',
    })
  })

  it('shows the nearest linked task or appointment, a note only when nothing else', () => {
    const contract = item({
      linked: [
        { kind: 'NOTE', at: null, allDay: false },
        { kind: 'EVENT', at: vn('2026-10-08T14:00'), allDay: false },
        { kind: 'TASK', at: vn('2026-10-07T00:00'), allDay: true },
      ],
    })
    expect(rowFlag(contract, now, TZ)).toMatchObject({ kind: 'TASK', text: 'Task · hạn T4 07/10' })
    expect(rowFlag(item({ linked: [{ kind: 'EVENT', at: vn('2026-10-05T08:30'), allDay: false }] }), now, TZ)).toMatchObject({
      kind: 'EVENT',
      text: 'Lịch hẹn · T2 05/10 08:30',
    })
    expect(rowFlag(item({ linked: [{ kind: 'TASK', at: vn('2026-10-03T17:00'), allDay: false }] }), now, TZ)?.text).toBe(
      'Task · hạn T7 03/10 17:00',
    )
    const overdueThenUpcoming = item({
      linked: [
        { kind: 'EVENT', at: vn('2026-10-01T09:00'), allDay: false },
        { kind: 'TASK', at: vn('2026-10-06T00:00'), allDay: true },
      ],
    })
    expect(rowFlag(overdueThenUpcoming, now, TZ)?.text).toBe('Task · hạn T3 06/10')
    expect(rowFlag(item({ linked: [{ kind: 'EVENT', at: vn('2026-09-30T09:00'), allDay: false }, { kind: 'EVENT', at: vn('2026-10-01T09:00'), allDay: false }] }), now, TZ)?.text).toBe(
      'Lịch hẹn · T5 01/10 09:00',
    )
    expect(rowFlag(item({ linked: [{ kind: 'NOTE', at: null, allDay: false }] }), now, TZ)).toMatchObject({ kind: 'NOTE', text: 'Ghi chú' })
    expect(rowFlag(item({}), now, TZ)).toBeNull()
  })
})

describe('row texts', () => {
  it('prefixes a group preview with the sender', () => {
    expect(previewText(item({ memberCount: 6, snippetFrom: 'Hà', snippet: 'Con mua bánh được không mẹ?' }))).toBe(
      'Hà: Con mua bánh được không mẹ?',
    )
    expect(previewText(item({ snippet: 'Em gửi lại bản đã sửa.' }))).toBe('Em gửi lại bản đã sửa.')
  })

  it('names the source, with the size of a group', () => {
    expect(sourceLabel(item({}), nameOf)).toBe('Gmail')
    expect(sourceLabel(item({ provider: 'zalo', kind: 'CHAT', memberCount: 6 }), nameOf)).toBe('Zalo · nhóm 6 người')
  })

  it('counts what is unread', () => {
    expect(unreadLabel(12)).toBe('12 chưa đọc')
    expect(unreadLabel(0)).toBe('Đã đọc hết')
  })
})

describe('filters', () => {
  const visible = item({ id: 'visible' })
  const unreadZalo = item({ id: 'unread-zalo', provider: 'zalo', unreadCount: 3, needsReply: true, hasAttachments: true })
  const scheduled = item({ id: 'scheduled', scheduledSend: { at: vn('2026-10-03T08:00'), failed: false } })
  const failed = item({ id: 'failed', scheduledSend: { at: vn('2026-10-01T21:00'), failed: true } })
  const snoozed = item({ id: 'snoozed', snooze: { until: vn('2026-10-03T08:00'), resurfacedAt: null } })
  const back = item({ id: 'back', snooze: { until: vn('2026-10-02T14:00'), resurfacedAt: vn('2026-10-02T14:00') } })
  const archived = item({ id: 'archived', archived: true, unreadCount: 1 })
  const all = [visible, unreadZalo, scheduled, failed, snoozed, back, archived]
  const ids = (view: Parameters<typeof filterConversations>[1]['view'], source: string | null = null) =>
    filterConversations(all, { source, view }, now).map((entry) => entry.id)

  it('hides archived and snoozed conversations from the inbox', () => {
    expect(ids('all')).toEqual(['visible', 'unread-zalo', 'scheduled', 'failed', 'back'])
  })

  it('keeps unread, waiting for a reply, with files, scheduled, snoozed or archived ones', () => {
    expect(ids('unread')).toEqual(['unread-zalo'])
    expect(ids('reply')).toEqual(['unread-zalo'])
    expect(ids('attachments')).toEqual(['unread-zalo'])
    expect(ids('scheduled')).toEqual(['scheduled'])
    expect(ids('snoozed')).toEqual(['snoozed'])
    expect(ids('archived')).toEqual(['archived'])
  })

  it('keeps one source', () => {
    expect(ids('all', 'zalo')).toEqual(['unread-zalo'])
    expect(ids('unread', 'gmail')).toEqual([])
  })
})

describe('the open conversation', () => {
  it('writes file sizes as the canvas does', () => {
    expect(formatFileSize(1_468_006)).toBe('1,4 MB')
    expect(formatFileSize(88_064)).toBe('86 KB')
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('counts the emails and files of a thread', () => {
    const message = (attachments: number): Message => ({
      id: String(Math.random()),
      kind: 'MESSAGE',
      direction: 'IN',
      sender: 'A',
      to: null,
      at: vn('2026-10-02T09:41'),
      text: 'x',
      attachments: Array.from({ length: attachments }, () => ({ name: 'a.pdf', type: 'PDF', sizeBytes: 1, image: false, caption: null })),
      status: null,
      linked: [],
    })
    expect(threadMeta([message(0), message(0), message(2)])).toBe('3 thư · 2 tệp')
    expect(threadMeta([message(0)])).toBe('1 thư')
  })

  it('says where a conversation comes from', () => {
    const gmail = { externalAccountId: 'an.nguyen@gmail.com' }
    const zalo = { externalAccountId: '+84 9•• ••• 218' }
    expect(threadSubtitle(item({}), gmail, nameOf)).toBe('Gmail · an.nguyen@gmail.com')
    expect(threadSubtitle(item({ provider: 'zalo', kind: 'CHAT', memberCount: 6 }), zalo, nameOf)).toBe(
      'Zalo · nhóm 6 người · qua +84 9•• ••• 218',
    )
    expect(threadSubtitle(item({ provider: 'messenger', kind: 'CHAT' }), { externalAccountId: 'an.nguyen.92' }, nameOf)).toBe(
      'Messenger · qua an.nguyen.92',
    )
  })

  it('dates emails: the open one in full, the folded ones short', () => {
    expect(mailTime(vn('2026-10-02T09:41'), now, TZ, true)).toBe('09:41 hôm nay')
    expect(mailTime(vn('2026-10-01T21:02'), now, TZ, true)).toBe('21:02 hôm qua')
    expect(mailTime(vn('2026-09-28T16:20'), now, TZ, true)).toBe('28/09 · 16:20')
    expect(mailTime(vn('2026-09-28T16:20'), now, TZ, false)).toBe('28/09')
  })

  it('writes the time and state under a chat bubble', () => {
    const out = (status: Message & { kind: 'MESSAGE' }) => bubbleMeta(status, TZ)
    const base = { id: 'm', kind: 'MESSAGE' as const, sender: 'Bạn', to: null, at: vn('2026-10-02T08:24'), text: 'x', attachments: [], linked: [] }
    expect(out({ ...base, direction: 'OUT', status: 'SENDING' })).toBe('08:24 · Đang gửi')
    expect(out({ ...base, direction: 'OUT', status: 'SEEN' })).toBe('08:24 · Đã xem')
    expect(out({ ...base, direction: 'OUT', status: 'FAILED' })).toBe('08:24 · Không gửi được')
    expect(out({ ...base, direction: 'IN', status: null })).toBe('08:24')
  })

  it('separates chat days by today, yesterday, then the weekday and date', () => {
    expect(chatDayLabel(vn('2026-10-02T08:15'), now, TZ)).toBe('HÔM NAY')
    expect(chatDayLabel(vn('2026-10-01T20:15'), now, TZ)).toBe('HÔM QUA')
    expect(chatDayLabel(vn('2026-09-29T20:15'), now, TZ)).toBe('THỨ BA · 29/09')
  })

  it('draws a day line above the first message of each day', () => {
    const system = (id: string, time: string): Message => ({ id, kind: 'SYSTEM', at: vn(time), text: id })
    const lines = withDayLines([system('a', '2026-10-01T20:15'), system('b', '2026-10-01T20:31'), system('c', '2026-10-02T07:58')], now, TZ)
    expect(lines.map((line) => [line.message.id, line.dayLine])).toEqual([
      ['a', 'HÔM QUA'],
      ['b', null],
      ['c', 'HÔM NAY'],
    ])
  })

  it('gives each member of a group the placeholder of their place, anyone else the striped one', () => {
    const members = ['Mẹ', 'Bố', 'Hà', 'Minh', 'Bà ngoại'].map((name) => ({ name, owner: false, joinedRecently: false }))
    expect(['Mẹ', 'Bố', 'Hà', 'Minh', 'Bà ngoại'].map((name) => memberPlaceholder(name, members))).toEqual(['a', 'd', 'c', 'b', 'a'])
    expect(memberPlaceholder('Lê Hoàng', null)).toBe('c')
  })

  it('splits a plain text body into paragraphs and lines', () => {
    expect(paragraphs('Chào anh An,\n\nEm gửi lại.\n\nCảm ơn anh,\nMinh Anh\n')).toEqual([['Chào anh An,'], ['Em gửi lại.'], ['Cảm ơn anh,', 'Minh Anh']])
    expect(firstLine('\nChào anh An,\nEm gửi lại.')).toBe('Chào anh An,')
  })

  it('describes linked tasks, appointments and notes', () => {
    const task: LinkedItem = { id: 't', kind: 'TASK', title: 'Trả lời', at: vn('2026-10-07T00:00'), allDay: true, remindAt: vn('2026-10-05T09:00'), pinned: false }
    const familyTask: LinkedItem = { ...task, at: vn('2026-10-03T17:00'), allDay: false, remindAt: vn('2026-10-02T18:00') }
    const event: LinkedItem = { id: 'e', kind: 'EVENT', title: 'Ký', at: vn('2026-10-08T14:00'), allDay: false, remindAt: null, pinned: false }
    const note: LinkedItem = { id: 'n', kind: 'NOTE', title: 'Điều khoản 4', at: null, allDay: false, remindAt: null, pinned: true }
    expect(linkedMeta(task, now, TZ)).toBe('hạn T4 07/10 · nhắc T2 09:00')
    expect(linkedMeta(event, now, TZ)).toBe('T5 08/10 14:00')
    expect(linkedMeta(note, now, TZ)).toBeNull()
    expect(linkedInfoSpec(familyTask, now, TZ)).toBe('TASK · T7 03/10 17:00 · NHẮC 18:00 HÔM NAY')
    expect(linkedInfoSpec({ ...event, at: vn('2026-10-03T18:30') }, now, TZ)).toBe('LỊCH HẸN · T7 03/10 18:30')
    expect(linkedInfoSpec(note, now, TZ)).toBe('GHI CHÚ · ĐÃ GHIM')
    expect(linkedInfoSpec({ ...note, pinned: false }, now, TZ)).toBe('GHI CHÚ')
  })
})
