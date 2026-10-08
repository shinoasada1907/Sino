import { describe, expect, it } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { createOverviewSample } from '@/features/overview/overview.sample'
import { filterConversations, groupConversations } from './format'
import { createConversationSample, createInboxSample } from './inbox.sample'

const TZ = 'Asia/Ho_Chi_Minh'
const now = new Date('2026-10-02T07:05:00Z')
const inbox = createInboxSample(now)
const HOUR = 3_600_000

describe('inbox sample data', () => {
  it('counts the same unread messages as the overview and the navigation', () => {
    const overview = createOverviewSample(now).inbox!
    expect(inbox.counts.unread).toBe(overview.unreadCount)
    expect(inbox.counts.byProvider.map(({ provider, unread }) => [provider, unread])).toEqual(
      overview.bySource.map(({ provider, unreadCount }) => [provider, unreadCount]),
    )
    expect(createShellSample(now).navCounts.inboxUnread).toBe(inbox.counts.unread)
    expect(inbox.counts.needsReply).toBe(overview.awaitingReplyCount)
  })

  it('never loads more unread messages of a source than the source counts', () => {
    for (const { provider, unread } of inbox.counts.byProvider) {
      const loaded = inbox.conversations.filter((item) => item.provider === provider).reduce((sum, item) => sum + item.unreadCount, 0)
      expect(loaded).toBeLessThanOrEqual(unread)
    }
  })

  it('shares the ids and titles of the overview conversations', () => {
    const overview = createOverviewSample(now).inbox!.conversations
    for (const conversation of overview) {
      expect(inbox.conversations.find((item) => item.id === conversation.id)?.title).toBe(conversation.title)
    }
  })

  it('shows the conversations of the canvas, grouped as the canvas groups them', () => {
    const groups = groupConversations(filterConversations(inbox.conversations, { source: null, view: 'all' }, now), now, TZ)
    expect(groups.map((group) => [group.label, group.items.map((item) => item.title)])).toEqual([
      ['HÔM NAY', ['Nhóm chạy bộ Hồ Tây', 'Trần Minh Anh', 'Gia đình', 'Phòng khám Ánh Dương']],
      ['HÔM QUA', ['Lê Hoàng', 'Thu Trang']],
      ['TUẦN NÀY', ['Điện lực Hà Nội']],
    ])
    expect(filterConversations(inbox.conversations, { source: null, view: 'snoozed' }, now)).toHaveLength(1)
    expect(filterConversations(inbox.conversations, { source: null, view: 'archived' }, now)).toHaveLength(1)
  })

  it('gives every conversation messages whose last delivered one is the one the list shows', () => {
    for (const item of inbox.conversations) {
      const detail = createConversationSample(item.id, now)
      expect(detail.id).toBe(item.id)
      const delivered = detail.messages.filter((message) => message.kind === 'MESSAGE' && message.status !== 'SENDING')
      const times = detail.messages.map((message) => Date.parse(message.at))
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(delivered.at(-1)?.at).toBe(item.lastMessageAt)
    }
  })

  it('details the contract email and the family chat as the canvas does', () => {
    const contract = createConversationSample('conv-1', now)
    expect(contract.messages).toHaveLength(3)
    expect(contract.messages.flatMap((message) => (message.kind === 'MESSAGE' ? message.attachments : []))).toHaveLength(2)
    const family = createConversationSample('conv-2', now)
    expect(family.messages.some((message) => message.id === family.firstUnreadId)).toBe(true)
    expect(family.members).toHaveLength(inbox.conversations.find((item) => item.id === 'conv-2')!.memberCount!)
    expect(createConversationSample('conv-4', now).canSend).toBe(false)
  })

  it('moves with the clock', () => {
    const later = createInboxSample(new Date(now.getTime() + 5 * HOUR))
    expect(Date.parse(later.conversations[0].lastMessageAt) - Date.parse(inbox.conversations[0].lastMessageAt)).toBe(5 * HOUR)
  })
})
