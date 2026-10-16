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
  it('shows the same unread numbers as the overview and the navigation', () => {
    const overview = createOverviewSample(now).inbox!
    expect(inbox.counts.unread).toBe(overview.unreadCount)
    expect(inbox.counts.byProvider.map(({ provider, unread }) => [provider, unread])).toEqual(
      overview.bySource.map(({ provider, unreadCount }) => [provider, unreadCount]),
    )
    expect(createShellSample(now).navCounts.inboxUnread).toBe(inbox.counts.unreadByKind?.EMAIL)
    expect(createShellSample(now).navCounts.messagesUnread).toBe(inbox.counts.unreadByKind?.CHAT)
    expect(inbox.counts.needsReply).toBe(overview.awaitingReplyCount)
  })

  it('never loads more unread conversations of a source than the source counts (D-70)', () => {
    for (const { provider, unread } of inbox.counts.byProvider) {
      const loaded = inbox.conversations.filter((item) => item.provider === provider && item.unreadCount > 0).length
      expect(loaded).toBeLessThanOrEqual(unread)
    }
  })

  it('says which providers are email and which are chat, as their conversations do (f05c, D-306)', () => {
    const kindOf = Object.fromEntries(inbox.providers.map(({ type, kind }) => [type, kind]))
    expect(kindOf).toEqual({ gmail: 'EMAIL', zalo: 'CHAT', messenger: 'CHAT' })
    for (const item of inbox.conversations) {
      expect(item.kind).toBe(kindOf[item.provider])
    }
  })

  it('counts the unread of each kind from the sources, as the canvas shows them: 7 in Hộp thư, 5 in Tin nhắn', () => {
    const kindOf = Object.fromEntries(inbox.providers.map(({ type, kind }) => [type, kind]))
    const sum = (kind: string) => inbox.counts.byProvider.filter(({ provider }) => kindOf[provider] === kind).reduce((total, { unread }) => total + unread, 0)
    expect(inbox.counts.unreadByKind).toEqual({ EMAIL: sum('EMAIL'), CHAT: sum('CHAT') })
    expect(inbox.counts.unreadByKind).toEqual({ EMAIL: 7, CHAT: 5 })
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
      const messages = detail.messages!
      const delivered = messages.filter((message) => message.kind === 'MESSAGE' && message.status !== 'SENDING')
      const times = messages.map((message) => Date.parse(message.at))
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(delivered.at(-1)?.at).toBe(item.lastMessageAt)
    }
  })

  it('details the contract email and the family chat as the canvas does', () => {
    const contract = createConversationSample('conv-1', now)
    expect(contract.messages).toHaveLength(3)
    expect(contract.messages!.flatMap((message) => (message.kind === 'MESSAGE' ? message.attachments : []))).toHaveLength(2)
    const family = createConversationSample('conv-2', now)
    expect(family.messages!.some((message) => message.id === family.firstUnreadId)).toBe(true)
    expect(family.members).toHaveLength(inbox.conversations.find((item) => item.id === 'conv-2')!.memberCount!)
    expect(createConversationSample('conv-4', now).canSend).toBe(false)
  })

  it('moves with the clock', () => {
    const later = createInboxSample(new Date(now.getTime() + 5 * HOUR))
    expect(Date.parse(later.conversations[0].lastMessageAt) - Date.parse(inbox.conversations[0].lastMessageAt)).toBe(5 * HOUR)
  })
})
