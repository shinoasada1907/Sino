import { describe, expect, it } from 'vitest'
import { applyChange, countsAfter } from './conversationChange'
import type { ConversationItem, InboxCounts } from './inbox.types'

const item: ConversationItem = {
  id: 'c-1',
  accountId: 'acc-1',
  accountIds: ['acc-1'],
  provider: 'gmail',
  kind: 'EMAIL',
  title: 'Trần Minh Anh',
  avatarUrl: null,
  subject: 'Hợp đồng quý 4',
  memberCount: null,
  snippetFrom: null,
  snippet: 'Chào An',
  lastMessageAt: '2026-10-02T06:41:00Z',
  unreadCount: 2,
  needsReply: true,
  hasAttachments: true,
  archived: false,
  snooze: null,
  scheduledSend: null,
  linked: [],
}

const counts: InboxCounts = {
  unread: 5,
  byProvider: [
    { provider: 'gmail', unread: 3 },
    { provider: 'zalo', unread: 2 },
  ],
  byAccount: {
    'acc-1': { unread: 3, needsReply: 3, withAttachments: 4 },
    'acc-2': { unread: 2, needsReply: 1, withAttachments: 2 },
  },
  needsReply: 4,
  withAttachments: 6,
  scheduled: 1,
  snoozed: 2,
  unreadByKind: null,
}

describe('applyChange', () => {
  it('reads every message, or makes the newest unread again', () => {
    expect(applyChange(item, { read: true }).unreadCount).toBe(0)
    expect(applyChange({ ...item, unreadCount: 0 }, { read: false }).unreadCount).toBe(1)
    expect(applyChange(item, { read: false }).unreadCount).toBe(2)
  })

  it('archives and brings back, and leaves the rest of the row alone', () => {
    expect(applyChange(item, { archived: true })).toEqual({ ...item, archived: true })
    expect(applyChange({ ...item, archived: true }, { archived: false })).toEqual(item)
    expect(applyChange(item, {})).toEqual(item)
  })
})

describe('countsAfter', () => {
  it('takes a conversation out of the unread counts when it is read', () => {
    expect(countsAfter(counts, item, { ...item, unreadCount: 0 })).toEqual({
      ...counts,
      unread: 4,
      byAccount: { ...counts.byAccount, 'acc-1': { unread: 2, needsReply: 3, withAttachments: 4 } },
      byProvider: [
        { provider: 'gmail', unread: 2 },
        { provider: 'zalo', unread: 2 },
      ],
    })
  })

  it('moves the unread of the conversation kind with the others, and leaves it unknown when the backend did not tell (f05c)', () => {
    const byKind = { ...counts, unreadByKind: { EMAIL: 3, CHAT: 2 } }
    expect(countsAfter(byKind, item, { ...item, unreadCount: 0 }).unreadByKind).toEqual({ EMAIL: 2, CHAT: 2 })
    const chat = { ...item, provider: 'zalo', kind: 'CHAT' as const, unreadCount: 0 }
    expect(countsAfter(byKind, chat, { ...chat, unreadCount: 4 }).unreadByKind).toEqual({ EMAIL: 3, CHAT: 3 })
    expect(countsAfter(counts, item, { ...item, unreadCount: 0 }).unreadByKind).toBeNull()
  })

  it('counts one conversation once, however many of its messages are unread', () => {
    expect(countsAfter(counts, item, { ...item, unreadCount: 1 })).toEqual(counts)
    expect(countsAfter(counts, { ...item, unreadCount: 0 }, item).unread).toBe(6)
  })

  it('takes an archived conversation out of every count, and puts it back when it comes back', () => {
    const archived = { ...item, archived: true }
    const out = countsAfter(counts, item, archived)
    expect(out).toEqual({
      ...counts,
      unread: 4,
      byAccount: { ...counts.byAccount, 'acc-1': { unread: 2, needsReply: 2, withAttachments: 3 } },
      byProvider: [
        { provider: 'gmail', unread: 2 },
        { provider: 'zalo', unread: 2 },
      ],
      needsReply: 3,
      withAttachments: 5,
    })
    expect(countsAfter(out, archived, item)).toEqual(counts)
  })

  it('leaves the counts alone for a change inside the archive', () => {
    expect(countsAfter(counts, { ...item, archived: true }, { ...item, archived: true, unreadCount: 0 })).toEqual(counts)
  })

  it('moves the numbers of every account holding the thread, and gives the others theirs back when it is undone (messages-by-account, D-432)', () => {
    const both = { ...item, accountIds: ['acc-1', 'acc-2'] }
    const read = countsAfter(counts, both, { ...both, unreadCount: 0 })
    expect(read.byAccount['acc-1'].unread).toBe(2)
    expect(read.byAccount['acc-2'].unread).toBe(1)
    // The total counts the thread once, though two accounts hold it.
    expect(read.unread).toBe(4)
    expect(countsAfter(read, { ...both, unreadCount: 0 }, both)).toEqual(counts)
  })

  it('starts the numbers of an account the counts did not list, and leaves it out when nothing moves', () => {
    const elsewhere = { ...item, accountId: 'acc-9', accountIds: ['acc-9'] }
    expect(countsAfter(counts, { ...elsewhere, unreadCount: 0 }, elsewhere).byAccount['acc-9']).toEqual({ unread: 1, needsReply: 0, withAttachments: 0 })
    expect(countsAfter(counts, elsewhere, { ...elsewhere, unreadCount: 1 }).byAccount).toEqual(counts.byAccount)
  })

  it('adds the source when the server listed none of its conversations as unread', () => {
    const none = { ...counts, byProvider: [{ provider: 'zalo', unread: 2 }] }
    expect(countsAfter(none, { ...item, unreadCount: 0 }, item).byProvider).toEqual([
      { provider: 'zalo', unread: 2 },
      { provider: 'gmail', unread: 1 },
    ])
  })

  it('never goes below zero when the counts were already behind', () => {
    const zero = { ...counts, unread: 0, byProvider: [{ provider: 'gmail', unread: 0 }], byAccount: { 'acc-1': { unread: 0, needsReply: 0, withAttachments: 0 } }, needsReply: 0, withAttachments: 0 }
    expect(countsAfter(zero, item, { ...item, archived: true })).toEqual(zero)
  })
})
