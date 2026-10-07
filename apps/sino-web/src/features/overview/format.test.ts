import { describe, expect, it } from 'vitest'
import {
  accountStatusView,
  accountSummary,
  accountsHeader,
  activityText,
  awaitingText,
  axisStartLabel,
  barHeights,
  conversationContext,
  formatCount,
  greeting,
  healthText,
  itemTimeLabel,
  methodLabel,
  numberWord,
  overdueText,
  providerNameOf,
  recurrenceLabel,
  registrationMeta,
  sourceShares,
  syncAriaLabel,
  todayCounts,
} from './format'
import type { OverviewAccount, TodayItem } from './overview.types'

const TZ = 'Asia/Ho_Chi_Minh'
const now = new Date('2026-10-02T07:05:00Z') // Friday 14:05 in Vietnam
const nameOf = providerNameOf([
  { type: 'gmail', displayName: 'Gmail' },
  { type: 'zalo', displayName: 'Zalo' },
  { type: 'messenger', displayName: 'Messenger' },
])

function account(provider: string, status: OverviewAccount['status'], extra: Partial<OverviewAccount> = {}): OverviewAccount {
  return {
    id: provider,
    provider,
    externalAccountId: `${provider}-id`,
    displayName: provider,
    status,
    lastSyncedAt: null,
    syncProgress: null,
    statusChangedAt: null,
    ...extra,
  }
}

function item(extra: Partial<TodayItem>): TodayItem {
  return { id: 'x', kind: 'TASK', title: 'Việc', at: now.toISOString(), done: false, recurrence: null, conversation: null, ...extra }
}

describe('greeting', () => {
  it('follows the time of day, with the hour boundaries', () => {
    expect(greeting(new Date('2026-10-01T22:00:00Z'), TZ)).toBe('Chào buổi sáng') // 05:00
    expect(greeting(new Date('2026-10-02T03:59:00Z'), TZ)).toBe('Chào buổi sáng') // 10:59
    expect(greeting(new Date('2026-10-02T04:00:00Z'), TZ)).toBe('Chào buổi trưa') // 11:00
    expect(greeting(new Date('2026-10-02T06:00:00Z'), TZ)).toBe('Chào buổi chiều') // 13:00
    expect(greeting(now, TZ)).toBe('Chào buổi chiều')
    expect(greeting(new Date('2026-10-02T11:00:00Z'), TZ)).toBe('Chào buổi tối') // 18:00
    expect(greeting(new Date('2026-10-01T21:59:00Z'), TZ)).toBe('Chào buổi tối') // 04:59
  })
})

describe('numbers', () => {
  it('writes small numbers as words and bigger ones as digits', () => {
    expect(numberWord(1)).toBe('một')
    expect(numberWord(2)).toBe('hai')
    expect(numberWord(10)).toBe('mười')
    expect(numberWord(11)).toBe('11')
  })

  it('groups thousands the Vietnamese way', () => {
    expect(formatCount(1284)).toBe('1.284')
    expect(formatCount(7)).toBe('7')
  })
})

describe('accounts', () => {
  const accounts = [
    account('gmail', 'CONNECTED'),
    account('zalo', 'CONNECTED', { syncProgress: 64 }),
    account('messenger', 'AUTH_EXPIRED'),
  ]

  it('sums up the accounts for the header, naming the one to sign in again', () => {
    expect(accountSummary(accounts, nameOf)).toEqual({
      normal: 'Hai tài khoản đang chạy bình thường.',
      issue: 'Messenger cần đăng nhập lại',
    })
  })

  it('counts the accounts that need action when there are several', () => {
    const two = [account('gmail', 'ERROR'), account('messenger', 'AUTH_EXPIRED')]
    expect(accountSummary(two, nameOf)).toEqual({
      normal: 'Chưa có tài khoản nào chạy bình thường.',
      issue: '2 tài khoản cần xử lý',
    })
    expect(accountSummary([account('gmail', 'ERROR')], nameOf).issue).toBe('Gmail đang gặp lỗi')
  })

  it('says so when no account is connected', () => {
    expect(accountSummary([], nameOf)).toEqual({ normal: 'Chưa kết nối tài khoản nào.', issue: null })
  })

  it('heads the accounts card with the total and what needs action', () => {
    expect(accountsHeader(accounts)).toBe('3 · 1 cần xử lý')
    expect(accountsHeader([account('gmail', 'CONNECTED')])).toBe('1')
  })

  it('describes each account status', () => {
    expect(accountStatusView(accounts[0], now, TZ)).toEqual({ tone: 'ok', label: 'Ổn định' })
    expect(accountStatusView(accounts[1], now, TZ)).toEqual({ tone: 'warn', label: '64%', progress: 64 })
    expect(
      accountStatusView(account('messenger', 'AUTH_EXPIRED', { statusChangedAt: '2026-10-01T14:04:00Z' }), now, TZ),
    ).toEqual({ tone: 'err', detail: 'Quyền hết hạn từ 21:04 hôm qua', action: 'Đăng nhập lại' })
    expect(accountStatusView(account('gmail', 'DISABLED'), now, TZ)).toEqual({ tone: 'off', label: 'Đã tắt' })
  })
})

describe('inbox', () => {
  it('says how many conversations wait for a reply', () => {
    expect(awaitingText(3)).toBe('3 cuộc trò chuyện đang chờ bạn trả lời.')
    expect(awaitingText(0)).toBe('Không có cuộc trò chuyện nào chờ bạn trả lời.')
  })

  it('gives each source its share of the unread messages', () => {
    const shares = sourceShares([
      { provider: 'gmail', unreadCount: 7 },
      { provider: 'zalo', unreadCount: 4 },
      { provider: 'messenger', unreadCount: 1 },
    ])
    expect(shares.map((s) => s.percent)).toEqual([58, 33, 8])
    expect(sourceShares([{ provider: 'gmail', unreadCount: 0 }])[0].percent).toBe(0)
    expect(sourceShares([{ provider: 'gmail', unreadCount: 2 }, { provider: 'zalo', unreadCount: 1 }]).map((s) => s.percent)).toEqual([67, 33])
  })

  it('shows the subject of an email, the source and group size of a chat', () => {
    const base = { id: 'c', provider: 'gmail', title: 'X', snippet: '', lastMessageAt: now.toISOString(), unreadCount: 0 }
    expect(conversationContext({ ...base, subject: 'Hợp đồng', memberCount: null }, 'Gmail')).toBe('Hợp đồng')
    expect(conversationContext({ ...base, subject: null, memberCount: 6 }, 'Zalo')).toBe('Zalo · nhóm 6 người')
    expect(conversationContext({ ...base, subject: null, memberCount: null }, 'Messenger')).toBe('Messenger')
  })
})

describe('today', () => {
  const items = [
    item({ kind: 'TASK' }),
    item({ kind: 'TASK', done: true }),
    item({ kind: 'EVENT' }),
    item({ kind: 'TASK' }),
    item({ kind: 'REMINDER' }),
  ]

  it('counts the to-dos and the appointments', () => {
    expect(todayCounts(items)).toBe('4 việc · 1 lịch hẹn')
    expect(todayCounts([item({ kind: 'EVENT' })])).toBe('1 lịch hẹn')
    expect(todayCounts([])).toBe('Trống')
  })

  it('says how late an unfinished item is', () => {
    expect(overdueText(item({ at: '2026-09-30T02:00:00Z' }), now, TZ)).toBe('Quá hạn 2 ngày')
    expect(overdueText(item({ at: '2026-10-01T03:00:00Z' }), now, TZ)).toBe('Quá hạn 1 ngày')
    expect(overdueText(item({ at: '2026-10-02T03:00:00Z' }), now, TZ)).toBe('Quá giờ')
    expect(overdueText(item({ at: '2026-09-30T02:00:00Z', done: true }), now, TZ)).toBeNull()
    expect(overdueText(item({ at: '2026-10-02T10:00:00Z' }), now, TZ)).toBeNull()
  })

  it('shows the time of a today item and the date of an older one', () => {
    expect(itemTimeLabel(item({ at: '2026-10-02T00:45:00Z' }), now, TZ)).toBe('07:45')
    expect(itemTimeLabel(item({ at: '2026-09-30T02:00:00Z' }), now, TZ)).toBe('30/09')
  })

  it('names the repetition', () => {
    expect(recurrenceLabel('MONTHLY')).toBe('Hằng tháng')
    expect(recurrenceLabel('DAILY')).toBe('Hằng ngày')
  })
})

describe('sync activity', () => {
  const start = (hour: number) => new Date(Date.UTC(2026, 9, 1, hour - 7)).toISOString()

  it('scales the bars to the busiest hour', () => {
    expect(
      barHeights([
        { start: start(15), messages: 50, health: 'OK' },
        { start: start(16), messages: 100, health: 'OK' },
        { start: start(17), messages: 0, health: 'OK' },
      ]),
    ).toEqual([50, 100, 0])
    expect(barHeights([{ start: start(15), messages: 0, health: 'OK' }])).toEqual([0])
  })

  it('describes the health of each source', () => {
    expect(healthText({ provider: 'gmail', health: 'OK', since: null }, 'Gmail', TZ)).toBe('Gmail')
    expect(healthText({ provider: 'zalo', health: 'WARNING', since: '2026-10-02T06:58:00Z' }, 'Zalo', TZ)).toBe(
      'Zalo · chậm lúc 13:58',
    )
    expect(healthText({ provider: 'messenger', health: 'ERROR', since: '2026-10-01T14:04:00Z' }, 'Messenger', TZ)).toBe(
      'Messenger · lỗi từ 21:04',
    )
  })

  it('reads the chart out for screen readers, errors first', () => {
    const label = syncAriaLabel(
      {
        buckets: [],
        providers: [
          { provider: 'gmail', health: 'OK', since: null },
          { provider: 'zalo', health: 'WARNING', since: '2026-10-02T06:58:00Z' },
          { provider: 'messenger', health: 'ERROR', since: '2026-10-01T14:04:00Z' },
        ],
      },
      nameOf,
      TZ,
    )
    expect(label).toBe('Số thư đồng bộ mỗi giờ trong 24 giờ qua. Messenger lỗi lúc 21 giờ, Zalo chậm lúc 13 giờ.')
  })

  it('labels where the chart starts', () => {
    expect(axisStartLabel(start(15), now, TZ)).toBe('15:00 hôm qua')
    expect(axisStartLabel('2026-10-02T02:00:00Z', now, TZ)).toBe('09:00')
  })
})

describe('registrations', () => {
  it('names the sign-in methods', () => {
    expect(methodLabel('google')).toBe('Google')
    expect(methodLabel('email')).toBe('Email')
    expect(methodLabel('apple-id')).toBe('Apple-id')
  })

  it('describes the latest registration', () => {
    expect(
      registrationMeta(
        { siteName: 'Diễn đàn Mây', domain: 'may.forum', method: 'zalo', detectedAt: '2026-09-30T03:00:00Z', isNew: true },
        TZ,
      ),
    ).toBe('may.forum · qua Zalo · 30/09')
  })
})

describe('activity', () => {
  it('writes one sentence per kind, with the name of a new site in bold', () => {
    expect(activityText({ id: 'a', at: '', kind: 'SYNC_RECOVERED', provider: 'zalo', downtimeMinutes: 4 }, nameOf, TZ)).toEqual([
      'Zalo đồng bộ lại sau 4 phút mất kết nối.',
    ])
    expect(
      activityText({ id: 'b', at: '', kind: 'REGISTRATION_DETECTED', siteName: 'Diễn đàn Mây', method: 'zalo' }, nameOf, TZ),
    ).toEqual(['Phát hiện đăng ký mới: ', { strong: 'Diễn đàn Mây' }, ', đăng nhập bằng Zalo.'])
    expect(
      activityText({ id: 'c', at: '2026-10-01T14:04:00Z', kind: 'AUTH_EXPIRED', provider: 'messenger' }, nameOf, TZ),
    ).toEqual(['Quyền truy cập Messenger hết hạn lúc 21:04.'])
    expect(
      activityText(
        { id: 'd', at: '', kind: 'ACCOUNT_CONNECTED', provider: 'gmail', externalAccountId: 'an.nguyen@gmail.com' },
        nameOf,
        TZ,
      ),
    ).toEqual(['Đã kết nối Gmail an.nguyen@gmail.com.'])
  })

  it('falls back to the provider code when the catalog does not know it', () => {
    expect(nameOf('telegram')).toBe('Telegram')
  })
})
