import { clockFrom } from '@/shared/time/canvasClock'
import type { ConversationDetail, ConversationItem, InboxData, Message } from './inbox.types'

const base = {
  memberCount: null,
  snippetFrom: null,
  unreadCount: 0,
  needsReply: false,
  hasAttachments: false,
  archived: false,
  snooze: null,
  scheduledSend: null,
  linked: [],
} satisfies Partial<ConversationItem>

/**
 * Sample data shaped like the "Sino UI" canvas (`Inbox`). The ids of the first four are those of the overview sample, so
 * reading a conversation updates both screens. Every time moves with `now`; at 14:05 it shows the canvas times.
 */
export function createInboxSample(now: Date): InboxData {
  const at = clockFrom(now)
  const conversations: ConversationItem[] = [
    {
      ...base,
      id: 'conv-5',
      accountId: 'acc-zalo',
      provider: 'zalo',
      kind: 'CHAT',
      title: 'Nhóm chạy bộ Hồ Tây',
      subject: null,
      snippetFrom: 'Tuấn',
      snippet: 'Sáng Chủ nhật 6 giờ, điểm hẹn cũ nhé mọi người.',
      lastMessageAt: at('2026-10-01T18:47:00+07:00'),
      snooze: { until: at('2026-10-02T14:00:00+07:00'), resurfacedAt: at('2026-10-02T14:00:00+07:00') },
    },
    {
      ...base,
      id: 'conv-1',
      accountId: 'acc-gmail',
      provider: 'gmail',
      kind: 'EMAIL',
      title: 'Trần Minh Anh',
      subject: 'Hợp đồng thuê văn phòng — bản sửa lần 2',
      snippet: 'Em gửi lại bản đã sửa điều khoản 4 và phụ lục giá theo trao đổi.',
      lastMessageAt: at('2026-10-02T09:41:00+07:00'),
      unreadCount: 1,
      needsReply: true,
      hasAttachments: true,
      linked: [
        { kind: 'TASK', at: at('2026-10-07T00:00:00+07:00'), allDay: true },
        { kind: 'EVENT', at: at('2026-10-08T14:00:00+07:00'), allDay: false },
        { kind: 'NOTE', at: null, allDay: false },
      ],
    },
    {
      ...base,
      id: 'conv-2',
      accountId: 'acc-zalo',
      provider: 'zalo',
      kind: 'CHAT',
      title: 'Gia đình',
      subject: null,
      memberCount: 6,
      snippetFrom: 'Hà',
      snippet: 'Con mua bánh bông lan trứng muối được không mẹ?',
      lastMessageAt: at('2026-10-02T08:20:00+07:00'),
      unreadCount: 3,
      needsReply: true,
      hasAttachments: true,
      linked: [
        { kind: 'TASK', at: at('2026-10-03T17:00:00+07:00'), allDay: false },
        { kind: 'EVENT', at: at('2026-10-03T18:30:00+07:00'), allDay: false },
        { kind: 'NOTE', at: null, allDay: false },
      ],
    },
    {
      ...base,
      id: 'conv-3',
      accountId: 'acc-gmail',
      provider: 'gmail',
      kind: 'EMAIL',
      title: 'Phòng khám Ánh Dương',
      subject: 'Nhắc lịch khám thứ Hai 05/10',
      snippet: 'Quý khách có lịch khám lúc 08:30. Vui lòng đến trước 15 phút.',
      lastMessageAt: at('2026-10-02T07:30:00+07:00'),
      unreadCount: 1,
      linked: [{ kind: 'EVENT', at: at('2026-10-05T08:30:00+07:00'), allDay: false }],
    },
    {
      ...base,
      id: 'conv-4',
      accountId: 'acc-messenger',
      provider: 'messenger',
      kind: 'CHAT',
      title: 'Lê Hoàng',
      subject: null,
      snippet: 'Ok, mai mình gửi file thiết kế bản cuối cho bạn.',
      lastMessageAt: at('2026-10-01T21:02:00+07:00'),
      needsReply: true,
      scheduledSend: { at: at('2026-10-02T08:00:00+07:00'), failed: true },
    },
    {
      ...base,
      id: 'conv-6',
      accountId: 'acc-gmail',
      provider: 'gmail',
      kind: 'EMAIL',
      title: 'Thu Trang',
      subject: 'Ảnh chuyến đi Đà Lạt',
      snippet: 'Mình gửi trước 40 tấm, phần còn lại để trong thư mục chung.',
      lastMessageAt: at('2026-10-01T10:15:00+07:00'),
      hasAttachments: true,
      scheduledSend: { at: at('2026-10-03T08:00:00+07:00'), failed: false },
    },
    {
      ...base,
      id: 'conv-7',
      accountId: 'acc-gmail',
      provider: 'gmail',
      kind: 'EMAIL',
      title: 'Điện lực Hà Nội',
      subject: 'Hóa đơn tiền điện tháng 9',
      snippet: 'Số tiền cần thanh toán 1.284.000 đ, hạn thanh toán 10/10/2026.',
      lastMessageAt: at('2026-09-29T09:12:00+07:00'),
    },
    {
      ...base,
      id: 'conv-8',
      accountId: 'acc-gmail',
      provider: 'gmail',
      kind: 'EMAIL',
      title: 'Nhà sách Lumen',
      subject: 'Đơn hàng #4821 đang được giao',
      snippet: 'Đơn hàng của bạn sẽ tới trong ngày thứ Bảy.',
      lastMessageAt: at('2026-09-30T16:40:00+07:00'),
      snooze: { until: at('2026-10-03T08:00:00+07:00'), resurfacedAt: null },
    },
    {
      ...base,
      id: 'conv-9',
      accountId: 'acc-gmail',
      provider: 'gmail',
      kind: 'EMAIL',
      title: 'Ví Hạt Đậu',
      subject: 'Sao kê tháng 8/2026',
      snippet: 'Sao kê tháng 8 của bạn đã sẵn sàng.',
      lastMessageAt: at('2026-09-05T09:00:00+07:00'),
      archived: true,
    },
  ]

  return {
    generatedAt: now.toISOString(),
    providers: [
      { type: 'gmail', displayName: 'Gmail' },
      { type: 'zalo', displayName: 'Zalo' },
      { type: 'messenger', displayName: 'Messenger' },
    ],
    accounts: [
      { id: 'acc-gmail', provider: 'gmail', externalAccountId: 'an.nguyen@gmail.com', status: 'CONNECTED', syncProgress: null },
      { id: 'acc-zalo', provider: 'zalo', externalAccountId: '+84 9•• ••• 218', status: 'CONNECTED', syncProgress: 64 },
      { id: 'acc-messenger', provider: 'messenger', externalAccountId: 'an.nguyen.92', status: 'AUTH_EXPIRED', syncProgress: null },
    ],
    counts: {
      unread: 12,
      byProvider: [
        { provider: 'gmail', unread: 7 },
        { provider: 'zalo', unread: 4 },
        { provider: 'messenger', unread: 1 },
      ],
      needsReply: 3,
      withAttachments: 5,
      scheduled: 1,
      snoozed: 1,
    },
    conversations,
    nextCursor: null,
  }
}

function message(extra: Partial<Message & { kind: 'MESSAGE' }> & { id: string; at: string; text: string }): Message {
  return { kind: 'MESSAGE', direction: 'IN', sender: '', to: null, attachments: [], status: null, linked: [], ...extra }
}

const emptyDetail = { firstUnreadId: null, linked: null, members: null, files: null, canSend: true, previousCursor: null }

/** The messages of one conversation; the contract email and the family chat follow the canvas in full. */
export function createConversationSample(conversationId: string, now: Date): ConversationDetail {
  const at = clockFrom(now)
  switch (conversationId) {
    case 'conv-1':
      return {
        ...emptyDetail,
        id: conversationId,
        firstUnreadId: 'conv-1-m3',
        messages: [
          message({
            id: 'conv-1-m1',
            direction: 'OUT',
            sender: 'Bạn',
            to: 'Trần Minh Anh',
            status: 'SENT',
            at: at('2026-09-28T16:20:00+07:00'),
            text: 'Gửi anh bản hợp đồng đầu tiên, anh xem trước phần thời hạn và giá thuê nhé.',
          }),
          message({
            id: 'conv-1-m2',
            sender: 'Trần Minh Anh',
            to: 'An Nguyễn',
            at: at('2026-09-30T10:05:00+07:00'),
            text: 'Em đã xem, có hai điểm cần sửa ở điều khoản 4 và phụ lục.',
          }),
          message({
            id: 'conv-1-m3',
            sender: 'Trần Minh Anh',
            to: 'An Nguyễn',
            at: at('2026-10-02T09:41:00+07:00'),
            text: [
              'Chào anh An,',
              'Em gửi lại bản đã sửa điều khoản 4 (thời hạn thanh toán) và phụ lục giá theo trao đổi hôm thứ Tư. Các chỗ thay đổi em đã đánh dấu trong file.',
              'Anh xem giúp và phản hồi trước thứ Tư 07/10 để bên em kịp trình ký nhé.',
              'Cảm ơn anh,\nMinh Anh',
            ].join('\n\n'),
            attachments: [
              { name: 'Hop-dong-thue-VP-v2.pdf', type: 'PDF', sizeBytes: 1_468_006, image: false, caption: null },
              { name: 'Phu-luc-gia.xlsx', type: 'XLSX', sizeBytes: 88_064, image: false, caption: null },
            ],
          }),
        ],
        linked: [
          {
            id: 'task-contract',
            kind: 'TASK',
            title: 'Trả lời: Hợp đồng thuê văn phòng',
            at: at('2026-10-07T00:00:00+07:00'),
            allDay: true,
            remindAt: at('2026-10-05T09:00:00+07:00'),
            pinned: false,
          },
          { id: 'event-sign', kind: 'EVENT', title: 'Ký hợp đồng', at: at('2026-10-08T14:00:00+07:00'), allDay: false, remindAt: null, pinned: false },
          { id: 'note-clause', kind: 'NOTE', title: 'Điều khoản 4 — thời hạn thanh toán', at: null, allDay: false, remindAt: null, pinned: false },
        ],
      }
    case 'conv-2':
      return {
        ...emptyDetail,
        id: conversationId,
        firstUnreadId: 'conv-2-m4',
        messages: [
          message({ id: 'conv-2-m1', sender: 'Bố', at: at('2026-10-01T20:15:00+07:00'), text: 'Tuần sau ông bà lên chơi, mấy đứa sắp xếp về nhé.' }),
          message({ id: 'conv-2-m2', direction: 'OUT', sender: 'Bạn', status: 'SEEN', at: at('2026-10-01T20:31:00+07:00'), text: 'Dạ, con về tối thứ Bảy ạ.' }),
          { id: 'conv-2-m3', kind: 'SYSTEM', at: at('2026-10-02T07:58:00+07:00'), text: 'Mẹ đã thêm Hà vào nhóm' },
          message({
            id: 'conv-2-m4',
            sender: 'Mẹ',
            at: at('2026-10-02T08:15:00+07:00'),
            text: 'Cuối tuần này cả nhà về ăn cơm nhé, nhớ mua bánh cho bà.',
            attachments: [{ name: 'thuc-don-cuoi-tuan.jpg', type: 'JPG', sizeBytes: 1_258_291, image: true, caption: 'thực đơn cuối tuần' }],
            linked: [{ kind: 'TASK', title: 'Mua bánh bông lan trứng muối cho bà' }],
          }),
          message({ id: 'conv-2-m5', sender: 'Hà', at: at('2026-10-02T08:20:00+07:00'), text: 'Con mua bánh bông lan trứng muối được không mẹ?' }),
          message({ id: 'conv-2-m6', direction: 'OUT', sender: 'Bạn', status: 'SENDING', at: at('2026-10-02T08:24:00+07:00'), text: 'Để con mang thêm trái cây nữa nhé.' }),
        ],
        linked: [
          {
            id: 'task-cake',
            kind: 'TASK',
            title: 'Mua bánh bông lan trứng muối cho bà',
            at: at('2026-10-03T17:00:00+07:00'),
            allDay: false,
            remindAt: at('2026-10-02T18:00:00+07:00'),
            pinned: false,
          },
          { id: 'event-dinner', kind: 'EVENT', title: 'Về nhà ăn cơm', at: at('2026-10-03T18:30:00+07:00'), allDay: false, remindAt: null, pinned: false },
          { id: 'note-list', kind: 'NOTE', title: 'Danh sách mua cho bà', at: null, allDay: false, remindAt: null, pinned: true },
        ],
        members: [
          { name: 'Mẹ', owner: true, joinedRecently: false },
          { name: 'Bố', owner: false, joinedRecently: false },
          { name: 'Hà', owner: false, joinedRecently: true },
          { name: 'Minh', owner: false, joinedRecently: false },
          { name: 'Bà ngoại', owner: false, joinedRecently: false },
          { name: 'Ông ngoại', owner: false, joinedRecently: false },
        ],
        files: { total: 14, items: [{ name: 'Lich-trinh-ve-que.docx', type: 'DOCX', sizeBytes: 24_576, at: at('2026-09-27T19:00:00+07:00') }] },
      }
    case 'conv-4':
      return {
        ...emptyDetail,
        id: conversationId,
        canSend: false,
        messages: [
          message({ id: 'conv-4-m1', sender: 'Lê Hoàng', at: at('2026-10-01T20:48:00+07:00'), text: 'Bản thiết kế cuối cậu xem chưa?' }),
          message({
            id: 'conv-4-m2',
            direction: 'OUT',
            sender: 'Bạn',
            status: 'SEEN',
            at: at('2026-10-01T20:55:00+07:00'),
            text: 'Xem rồi, ổn đấy. Cậu gửi file gốc giúp mình nhé.',
          }),
          message({ id: 'conv-4-m3', sender: 'Lê Hoàng', at: at('2026-10-01T21:02:00+07:00'), text: 'Ok, mai mình gửi file thiết kế bản cuối cho bạn.' }),
        ],
      }
    default: {
      const item = createInboxSample(now).conversations.find((conversation) => conversation.id === conversationId)
      return {
        ...emptyDetail,
        id: conversationId,
        messages: item
          ? [message({ id: `${conversationId}-m1`, sender: item.snippetFrom ?? item.title, at: item.lastMessageAt, text: item.snippet })]
          : [],
      }
    }
  }
}
