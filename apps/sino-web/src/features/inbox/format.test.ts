import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/problem'
import { providerNameOf } from '@/shared/format'
import type { ConversationItem, LinkedItem, Message } from './inbox.types'
import {
  arrivedRows,
  bubbleMeta,
  chatDayLabel,
  dayGroupLabel,
  defaultSender,
  disconnectedSince,
  failureDetail,
  failureReason,
  linkParts,
  recipientsText,
  withOutbox,
  filterConversations,
  firstLine,
  formatFileSize,
  groupConversations,
  linkedInfoSpec,
  linkedMeta,
  mailSender,
  mailTime,
  memberPlaceholder,
  newMailText,
  notArrivedSince,
  paragraphs,
  parseRecipients,
  previewText,
  rowAccounts,
  rowFlag,
  rowTime,
  sendBlock,
  sendBlockText,
  sendState,
  sendingNote,
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
    accountIds: ['acc-gmail'],
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

  it('names the accounts of a row only when its source has more than one', () => {
    const home = { id: 'acc-home', provider: 'gmail', address: 'an.nguyen@gmail.com' }
    const work = { id: 'acc-work', provider: 'gmail', address: 'an@congty.vn' }
    const zalo = { id: 'acc-zalo', provider: 'zalo', address: '+84 9•• ••• 218' }
    const accounts = [home, zalo, work]
    const on = (...accountIds: string[]) => item({ accountId: accountIds[0], accountIds })

    expect(rowAccounts(on('acc-work'), accounts)).toEqual([work])
    expect(rowAccounts(on('acc-home'), accounts)).toEqual([home])
    // A thread found in two accounts names both, the primary copy first (f05b, D-182).
    expect(rowAccounts(on('acc-work', 'acc-home'), accounts)).toEqual([work, home])
    expect(rowAccounts(on('acc-home', 'acc-gone'), accounts)).toEqual([home])
    expect(rowAccounts({ ...on('acc-zalo'), provider: 'zalo' }, accounts)).toEqual([])
    expect(rowAccounts(on('acc-home'), [home, zalo])).toEqual([])
    expect(rowAccounts(on('acc-gone'), accounts)).toEqual([])
  })

  it('counts what is unread', () => {
    expect(unreadLabel(12)).toBe('12 chưa đọc')
    expect(unreadLabel(0)).toBe('Đã đọc hết')
  })
})

describe('a new mail (f10-new-mail)', () => {
  it('splits the recipients on commas, semicolons and lines, drops repeats, and names the invalid ones (D-197)', () => {
    expect(parseRecipients(' minhanh@acme.vn, An@Congty.vn ;\nan@congty.vn ,, ')).toEqual({ addresses: ['minhanh@acme.vn', 'An@Congty.vn'], invalid: [] })
    expect(parseRecipients('minhanh@acme.vn, an@, @acme.vn, an@acme, a b@acme.vn, a@@acme.vn')).toEqual({
      addresses: ['minhanh@acme.vn'],
      invalid: ['an@', '@acme.vn', 'an@acme', 'a b@acme.vn', 'a@@acme.vn'],
    })
    expect(parseRecipients(`${'a'.repeat(247)}@acme.vn`).invalid).toHaveLength(1) // 255 characters
    expect(parseRecipients('   ')).toEqual({ addresses: [], invalid: [] })
  })

  it('starts from the account used last while it can send, else the first that can (D-193)', () => {
    const accounts = [
      { id: 'expired', sending: 'UNAVAILABLE' as const },
      { id: 'home', sending: 'READY' as const },
      { id: 'work', sending: 'READY' as const },
      { id: 'read-only', sending: 'NEEDS_PERMISSION' as const },
    ]
    expect(defaultSender(accounts, 'work')).toBe('work')
    expect(defaultSender(accounts, 'read-only')).toBe('home')
    expect(defaultSender(accounts, 'gone')).toBe('home')
    expect(defaultSender(accounts, null)).toBe('home')
    expect(defaultSender(accounts.slice(0, 1), null)).toBeNull()
  })

  it('says why an account cannot send', () => {
    expect(sendingNote('READY')).toBeNull()
    expect(sendingNote('NEEDS_PERMISSION')).toBe('Cần cấp quyền gửi')
    expect(sendingNote('UNAVAILABLE')).toBe('Cần đăng nhập lại')
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
    const gmail = { address: 'an.nguyen@gmail.com' }
    const zalo = { address: '+84 9•• ••• 218' }
    expect(threadSubtitle(item({}), [gmail], nameOf)).toBe('Gmail · an.nguyen@gmail.com')
    expect(threadSubtitle(item({}), [gmail, { address: 'an@congty.vn' }], nameOf)).toBe('Gmail · an.nguyen@gmail.com, an@congty.vn')
    expect(threadSubtitle(item({ provider: 'zalo', kind: 'CHAT', memberCount: 6 }), [zalo], nameOf)).toBe(
      'Zalo · nhóm 6 người · qua +84 9•• ••• 218',
    )
    expect(threadSubtitle(item({ provider: 'messenger', kind: 'CHAT' }), [{ address: 'an.nguyen.92' }], nameOf)).toBe(
      'Messenger · qua an.nguyen.92',
    )
  })

  it('names the address an own email went from, only in a thread of several accounts (f05b, D-184)', () => {
    const own = { sender: 'Bạn', ownAddress: 'tienct07@gmail.com' }
    expect(mailSender(own, true)).toBe('Bạn · tienct07@gmail.com')
    expect(mailSender(own, false)).toBe('Bạn')
    expect(mailSender({ sender: 'Sinon sama' }, true)).toBe('Sinon sama')
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

  it('says an email is still sending or failed, and nothing once it went out', () => {
    const mail = (status: 'SENDING' | 'SENT' | 'SEEN' | 'FAILED' | 'UNKNOWN' | null) => ({ id: 'm', kind: 'MESSAGE' as const, direction: 'OUT' as const, sender: 'Bạn', to: null, at: vn('2026-10-02T14:05'), text: 'x', attachments: [], status, linked: [] })
    expect(sendState(mail('SENDING'))).toBe('Đang gửi')
    expect(sendState(mail('FAILED'))).toBe('Không gửi được')
    expect(sendState(mail('UNKNOWN'))).toBe('Chưa rõ đã gửi chưa')
    expect(sendState(mail('SENT'))).toBeNull()
    expect(sendState(mail('SEEN'))).toBeNull()
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

  it('names what failed: the code and request of the error when it has them, and the time', () => {
    const at = new Date(vn('2026-10-02T14:02'))
    expect(failureDetail(Object.assign(new Error('timeout'), { code: 'ERR_TIMEOUT', requestId: '7f3a-91c2' }), at, TZ)).toBe('ERR_TIMEOUT · yêu cầu 7f3a-91c2 · 14:02')
    expect(failureDetail(new Error('network'), at, TZ)).toBe('14:02')
    expect(failureDetail({ code: 42, requestId: null }, at, TZ)).toBe('14:02')
  })

  it('tells a server that answered with an error from one that did not answer', () => {
    const answered = 'Máy chủ Sino trả lỗi khi lấy hộp thư. Thư và tin nhắn của bạn vẫn an toàn ở nhà cung cấp.'
    const silent = 'Máy chủ Sino không phản hồi. Thư và tin nhắn của bạn vẫn an toàn ở nhà cung cấp.'
    expect(failureReason(new ApiError(404, 'RESOURCE_NOT_FOUND', null))).toBe(answered)
    expect(failureReason(new ApiError(503, 'HTTP_503', null))).toBe(answered)
    expect(failureReason(new ApiError(0, 'NETWORK_ERROR', null))).toBe(silent)
    expect(failureReason(new Error('timeout'))).toBe(silent)
    expect(failureReason(null)).toBe(silent)
  })

  it('says since when an expired account receives nothing', () => {
    expect(disconnectedSince(vn('2026-10-01T21:04'), now, TZ)).toBe('Ngắt kết nối từ 21:04 hôm qua')
    expect(notArrivedSince(vn('2026-10-01T21:04'), now, TZ)).toBe('Tin nhắn sau 21:04 chưa về Sino')
    expect(notArrivedSince(vn('2026-10-02T09:30'), now, TZ)).toBe('Tin nhắn sau 09:30 chưa về Sino')
    expect(notArrivedSince(vn('2026-09-28T16:20'), now, TZ)).toBe('Tin nhắn sau T2 28/09 16:20 chưa về Sino')
  })

  it('blocks sending to sign in again, or to grant sending again', () => {
    expect(sendBlock({ status: 'AUTH_EXPIRED' }, true)).toBe('RECONNECT')
    expect(sendBlock({ status: 'AUTH_EXPIRED' }, false)).toBe('RECONNECT')
    expect(sendBlock({ status: 'CONNECTED' }, false)).toBe('PERMISSION')
    expect(sendBlock({ status: 'CONNECTED' }, true)).toBeNull()
    expect(sendBlock({ status: 'CONNECTED' }, undefined)).toBeNull()
    expect(sendBlockText('RECONNECT', 'EMAIL', 'Messenger', 'an.nguyen.92')).toEqual({
      title: 'Cần đăng nhập lại Messenger để nhận và gửi tin',
      text: 'Quyền truy cập đã hết hạn. Tin cũ vẫn đọc được ở đây.',
    })
    expect(sendBlockText('PERMISSION', 'EMAIL', 'Gmail', 'an.nguyen@gmail.com')).toEqual({
      title: 'Sino chưa có quyền gửi thư từ an.nguyen@gmail.com',
      text: 'Bạn vẫn đọc thư bình thường. Cấp thêm quyền gửi để trả lời từ Sino.',
    })
    expect(sendBlockText('PERMISSION', 'CHAT', 'Zalo', '+84 9•• ••• 218').title).toBe('Sino chưa có quyền gửi tin từ +84 9•• ••• 218')
  })

  it('sends to the provider when it cannot send from Sino, or the API does not tell (D-134), after signing in again', () => {
    expect(sendBlock({ status: 'CONNECTED' }, null)).toBe('NOT_READY')
    expect(sendBlock({ status: 'AUTH_EXPIRED' }, null)).toBe('RECONNECT')
    expect(sendBlockText('NOT_READY', 'EMAIL', 'Gmail', 'an.nguyen@gmail.com')).toEqual({
      title: 'Gmail chưa cho Sino gửi thư',
      text: 'Bạn trả lời trong Gmail.',
    })
    expect(sendBlockText('NOT_READY', 'CHAT', 'Zalo', '+84 9•• ••• 218').title).toBe('Zalo chưa cho Sino gửi tin')
  })
})

describe('conversations that arrive while the list is open (FE-54, MotionSpec C)', () => {
  it('finds the rows above the first one already shown, and slides them in up to six', () => {
    expect(arrivedRows(null, ['a', 'b'])).toEqual({ ids: new Set(), slide: false })
    // The first page coming in after the list was empty (loading) is not mail that arrived.
    expect(arrivedRows(new Set(), ['a', 'b'])).toEqual({ ids: new Set(), slide: false })
    expect(arrivedRows(new Set(['a', 'b']), ['n1', 'n2', 'a', 'b'])).toEqual({ ids: new Set(['n1', 'n2']), slide: true })
    expect(arrivedRows(new Set(['a', 'b']), ['a', 'b'])).toEqual({ ids: new Set(), slide: false })
  })

  it('does not count older rows loaded at the end, nor a known conversation that moves to the top', () => {
    expect(arrivedRows(new Set(['a', 'b']), ['a', 'b', 'c', 'd'])).toEqual({ ids: new Set(), slide: false })
    expect(arrivedRows(new Set(['a', 'b']), ['b', 'a'])).toEqual({ ids: new Set(), slide: false })
  })

  it('shows more than six new rows at once, without sliding', () => {
    const fresh = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']
    expect(arrivedRows(new Set(['a']), [...fresh, 'a'])).toEqual({ ids: new Set(fresh), slide: false })
    expect(arrivedRows(new Set(['a']), [...fresh.slice(0, 6), 'a']).slide).toBe(true)
  })

  it('says how many new emails came', () => {
    expect(newMailText(1)).toBe('1 thư mới')
    expect(newMailText(1200)).toBe('1.200 thư mới')
  })
})

describe('the messages sent from this browser (FE-62, D-134)', () => {
  const at = '2026-10-02T07:05:00Z'
  const mail = (id: string, status: 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN' | null, clientMessageId?: string): Message & { kind: 'MESSAGE' } => ({
    id,
    kind: 'MESSAGE',
    direction: status ? 'OUT' : 'IN',
    sender: status ? 'Bạn' : 'An',
    to: null,
    at,
    text: id,
    attachments: [],
    status,
    linked: [],
    clientMessageId,
  })
  const inbound = mail('m-1', null)

  it('adds what the server does not have yet after its messages', () => {
    const sending = mail('local-a', 'SENDING', 'a')
    const failed = mail('local-b', 'FAILED', 'b')
    expect(withOutbox([inbound], [sending, failed])).toEqual([inbound, sending, failed])
  })

  it('shows the server copy once the server has it', () => {
    const stored = mail('m-2', 'SENT', 'a')
    expect(withOutbox([inbound, stored], [mail('local-a', 'SENT', 'a')])).toEqual([inbound, stored])
    const storedFailed = mail('m-3', 'FAILED', 'b')
    expect(withOutbox([inbound, storedFailed], [mail('m-3', 'FAILED', 'b')])).toEqual([inbound, storedFailed])
  })

  it('shows a message being sent again in place of the failed copy of the server', () => {
    const again = mail('m-3', 'SENDING', 'b')
    expect(withOutbox([inbound, mail('m-3', 'FAILED', 'b')], [again])).toEqual([inbound, again])
  })

  it('lets the server copy win while the server is sending it, or once it went, whatever this browser still shows', () => {
    const waiting = mail('local-b', 'SENDING', 'b')
    const running = mail('m-3', 'SENDING', 'b')
    const sent = mail('m-3', 'SENT', 'b')
    expect(withOutbox([inbound, running], [waiting])).toEqual([inbound, running])
    expect(withOutbox([inbound, sent], [waiting])).toEqual([inbound, sent])
  })
})

describe('who a reply goes to (FE-61, D-133)', () => {
  it('names each person with their address, and a person without a name by the address alone', () => {
    expect(recipientsText([{ name: 'Trần Minh Anh', address: 'minhanh@acme.vn' }, { name: null, address: 'binh@example.com' }])).toBe(
      'Trần Minh Anh <minhanh@acme.vn>, binh@example.com',
    )
    expect(recipientsText([])).toBe('')
  })
})

describe('web addresses in the text of an email (FE-57)', () => {
  it('makes each http and https address a link, and leaves the rest as text', () => {
    expect(linkParts('Xem https://acme.vn/a?b=1 và http://x.vn nhé')).toEqual([
      { text: 'Xem ', href: null },
      { text: 'https://acme.vn/a?b=1', href: 'https://acme.vn/a?b=1' },
      { text: ' và ', href: null },
      { text: 'http://x.vn', href: 'http://x.vn' },
      { text: ' nhé', href: null },
    ])
  })

  it('leaves the punctuation that ends a sentence out of the link', () => {
    expect(linkParts('(https://acme.vn/hop-dong).')).toEqual([
      { text: '(', href: null },
      { text: 'https://acme.vn/hop-dong', href: 'https://acme.vn/hop-dong' },
      { text: ').', href: null },
    ])
    expect(linkParts('https://a.vn/x?!,;:')).toEqual([
      { text: 'https://a.vn/x', href: 'https://a.vn/x' },
      { text: '?!,;:', href: null },
    ])
  })

  it('leaves the quotes around an address out of the link', () => {
    expect(linkParts(`Mở "https://acme.vn/a" hoặc 'https://acme.vn/b'`)).toEqual([
      { text: 'Mở "', href: null },
      { text: 'https://acme.vn/a', href: 'https://acme.vn/a' },
      { text: `" hoặc '`, href: null },
      { text: 'https://acme.vn/b', href: 'https://acme.vn/b' },
      { text: "'", href: null },
    ])
  })

  it('makes no link of an address with nothing after the scheme', () => {
    expect(linkParts('Xem https://.')).toEqual([{ text: 'Xem https://.', href: null }])
  })

  it('makes no link of other schemes or of a bare domain', () => {
    expect(linkParts('javascript:alert(1) www.acme.vn mailto:a@b.vn')).toEqual([{ text: 'javascript:alert(1) www.acme.vn mailto:a@b.vn', href: null }])
    expect(linkParts('')).toEqual([])
  })
})
