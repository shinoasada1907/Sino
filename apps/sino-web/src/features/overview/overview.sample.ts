import type { OverviewData } from './overview.types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Hourly bar heights of the canvas `Dashboard` (percent of the busiest hour), oldest first.
const BAR_HEIGHTS = [40, 55, 48, 62, 70, 58, 34, 22, 15, 10, 8, 6, 5, 8, 20, 45, 72, 84, 66, 58, 44, 52, 28, 60]
const SYNCED_MESSAGES = 1284

/**
 * Sample data shaped like the "Sino UI" canvas. Every time is relative to `now`, so the screen looks current
 * whenever it is opened; at 14:05 it shows exactly the times of the canvas.
 */
export function createOverviewSample(now: Date): OverviewData {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const ahead = (ms: number) => new Date(now.getTime() + ms).toISOString()
  const authExpiredAt = ago(17 * HOUR + MINUTE) // 21:04 yesterday at 14:05

  return {
    generatedAt: now.toISOString(),
    providers: [
      { type: 'gmail', displayName: 'Gmail' },
      { type: 'zalo', displayName: 'Zalo' },
      { type: 'messenger', displayName: 'Messenger' },
    ],
    accounts: [
      {
        id: 'acc-gmail',
        provider: 'gmail',
        externalAccountId: 'an.nguyen@gmail.com',
        displayName: 'An Nguyễn',
        status: 'CONNECTED',
        lastSyncedAt: ago(2 * MINUTE),
        syncProgress: null,
        statusChangedAt: null,
      },
      {
        id: 'acc-zalo',
        provider: 'zalo',
        externalAccountId: '+84 9•• ••• 218',
        displayName: 'An',
        status: 'CONNECTED',
        lastSyncedAt: ago(5 * MINUTE),
        syncProgress: 64,
        statusChangedAt: null,
      },
      {
        id: 'acc-messenger',
        provider: 'messenger',
        externalAccountId: 'an.nguyen.92',
        displayName: 'An Nguyễn',
        status: 'AUTH_EXPIRED',
        lastSyncedAt: authExpiredAt,
        syncProgress: null,
        statusChangedAt: authExpiredAt,
      },
    ],
    inbox: {
      unreadCount: 12,
      awaitingReplyCount: 3,
      bySource: [
        { provider: 'gmail', unreadCount: 7 },
        { provider: 'zalo', unreadCount: 4 },
        { provider: 'messenger', unreadCount: 1 },
      ],
      conversations: [
        {
          id: 'conv-1',
          provider: 'gmail',
          title: 'Trần Minh Anh',
          subject: 'Hợp đồng thuê văn phòng — bản sửa lần 2',
          memberCount: null,
          snippet: 'Mình gửi lại bản đã sửa điều khoản 4 và phụ lục giá.',
          lastMessageAt: ago(4 * HOUR + 24 * MINUTE),
          unreadCount: 1,
        },
        {
          id: 'conv-2',
          provider: 'zalo',
          title: 'Gia đình',
          subject: null,
          memberCount: 6,
          snippet: 'Mẹ: Cuối tuần này cả nhà về ăn cơm nhé, nhớ mua bánh cho bà.',
          lastMessageAt: ago(5 * HOUR + 50 * MINUTE),
          unreadCount: 3,
        },
        {
          id: 'conv-3',
          provider: 'gmail',
          title: 'Phòng khám Ánh Dương',
          subject: 'Nhắc lịch khám thứ Hai 05/10',
          memberCount: null,
          snippet: 'Quý khách có lịch khám lúc 08:30. Vui lòng đến trước 15 phút.',
          lastMessageAt: ago(6 * HOUR + 35 * MINUTE),
          unreadCount: 1,
        },
        {
          id: 'conv-4',
          provider: 'messenger',
          title: 'Lê Hoàng',
          subject: null,
          memberCount: null,
          snippet: 'Ok, mai mình gửi file thiết kế bản cuối cho bạn.',
          lastMessageAt: ago(20 * HOUR),
          unreadCount: 0,
        },
      ],
    },
    today: {
      items: [
        {
          id: 'item-1',
          kind: 'TASK',
          title: 'Gửi lại hóa đơn tháng 9 cho kế toán',
          at: ago(2 * DAY),
          done: false,
          recurrence: null,
          conversation: null,
        },
        {
          id: 'item-2',
          kind: 'TASK',
          title: 'Xác nhận lịch khám',
          at: ago(6 * HOUR + 20 * MINUTE),
          done: true,
          recurrence: null,
          conversation: null,
        },
        {
          id: 'item-3',
          kind: 'EVENT',
          title: 'Gọi Minh Anh về phụ lục giá',
          at: ahead(HOUR + 55 * MINUTE),
          done: false,
          recurrence: null,
          conversation: { provider: 'gmail', title: 'Trần Minh Anh' },
        },
        {
          id: 'item-4',
          kind: 'TASK',
          title: 'Chuyển tiền nhà tháng 10',
          at: ahead(2 * HOUR + 55 * MINUTE),
          done: false,
          recurrence: 'MONTHLY',
          conversation: null,
        },
        {
          id: 'item-5',
          kind: 'REMINDER',
          title: 'Nhắc: Mua bánh bông lan trứng muối',
          at: ahead(3 * HOUR + 55 * MINUTE),
          done: false,
          recurrence: null,
          conversation: { provider: 'zalo', title: 'Gia đình' },
        },
      ],
      tomorrow: { firstEvent: { title: 'Về nhà ăn cơm', at: ahead(DAY + 4 * HOUR + 25 * MINUTE) }, taskCount: 1 },
    },
    syncActivity: {
      buckets: hourlyBuckets(now),
      providers: [
        { provider: 'gmail', health: 'OK', since: null },
        { provider: 'zalo', health: 'WARNING', since: ago(7 * MINUTE) },
        { provider: 'messenger', health: 'ERROR', since: authExpiredAt },
      ],
    },
    registrations: {
      total: 48,
      updatedAt: ago(2 * HOUR + 25 * MINUTE),
      byMethod: [
        { method: 'google', count: 21 },
        { method: 'email', count: 14 },
        { method: 'facebook', count: 8 },
        { method: 'zalo', count: 5 },
      ],
      latest: { siteName: 'Diễn đàn Mây', domain: 'may.forum', method: 'zalo', detectedAt: ago(2 * DAY), isNew: true },
    },
    activity: [
      { id: 'act-1', at: ago(3 * MINUTE), kind: 'SYNC_RECOVERED', provider: 'zalo', downtimeMinutes: 4 },
      { id: 'act-2', at: ago(2 * HOUR + 25 * MINUTE), kind: 'REGISTRATION_DETECTED', siteName: 'Diễn đàn Mây', method: 'zalo' },
      { id: 'act-3', at: authExpiredAt, kind: 'AUTH_EXPIRED', provider: 'messenger' },
      { id: 'act-4', at: ago(3 * DAY), kind: 'ACCOUNT_CONNECTED', provider: 'gmail', externalAccountId: 'an.nguyen@gmail.com' },
    ],
  }
}

/** 24 hourly buckets ending with the current hour; the canvas marks an error at index 6 and a slowdown at index 22. */
function hourlyBuckets(now: Date): NonNullable<OverviewData['syncActivity']>['buckets'] {
  const currentHour = Math.floor(now.getTime() / HOUR) * HOUR
  const heightSum = BAR_HEIGHTS.reduce((sum, height) => sum + height, 0)
  const messages = BAR_HEIGHTS.map((height) => Math.round((height / heightSum) * SYNCED_MESSAGES))
  messages[messages.length - 1] += SYNCED_MESSAGES - messages.reduce((sum, count) => sum + count, 0)

  return messages.map((count, index) => ({
    start: new Date(currentHour - (BAR_HEIGHTS.length - 1 - index) * HOUR).toISOString(),
    messages: count,
    health: index === 6 ? 'ERROR' : index === 22 ? 'WARNING' : 'OK',
  }))
}
