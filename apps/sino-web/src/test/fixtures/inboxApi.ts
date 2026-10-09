/** The Hộp thư API of F05 (`openspec/changes/f05-unified-inbox`, design section 4), as the web expects it before BE-44. */
export const API_CONVERSATIONS = [
  {
    id: 'c-1',
    accountId: 'acc-1',
    provider: 'gmail',
    kind: 'EMAIL',
    title: 'Trần Minh Anh',
    subject: 'Hợp đồng quý 4',
    memberCount: null,
    snippetFrom: null,
    snippet: 'Chào An, mình gửi bản hợp đồng đã sửa theo góp ý hôm qua.',
    lastMessageAt: '2026-10-02T06:41:00.123Z',
    unreadCount: 2,
    needsReply: true,
    hasAttachments: true,
    archived: false,
    snooze: null,
    scheduledSend: null,
    linked: null,
  },
  {
    id: 'c-2',
    accountId: 'acc-1',
    provider: 'gmail',
    kind: 'EMAIL',
    title: 'Ngân hàng ACB',
    subject: 'Sao kê tháng 9',
    memberCount: null,
    snippetFrom: null,
    snippet: null,
    lastMessageAt: '2026-10-01T02:10:00Z',
    unreadCount: 0,
    needsReply: false,
    hasAttachments: false,
    archived: false,
    snooze: null,
    scheduledSend: null,
    linked: null,
  },
]

export const API_COUNTS = { unread: 1, byProvider: { gmail: 1 }, needsReply: 1, withAttachments: 1, scheduled: 0, snoozed: 0 }

export const API_PARTICIPANTS = [
  { externalId: 'minhanh@acme.vn', name: 'Trần Minh Anh', avatarUrl: null, self: false },
  { externalId: 'an.nguyen@gmail.com', name: null, avatarUrl: null, self: true },
]
