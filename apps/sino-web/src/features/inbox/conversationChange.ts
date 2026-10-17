import type { ConversationItem, InboxCounts } from './inbox.types'

/** What the user can change about a conversation, in Sino only (D-67): `PATCH /api/conversations/{id}`. */
export interface ConversationChange {
  read?: boolean
  archived?: boolean
}

/** The row as the server will store it: reading clears every unread message, marking unread makes the newest one unread. */
export function applyChange(item: ConversationItem, { read, archived }: ConversationChange): ConversationItem {
  let next = item
  if (read !== undefined) {
    next = { ...next, unreadCount: read ? 0 : Math.max(1, next.unreadCount) }
  }
  if (archived !== undefined) {
    next = { ...next, archived }
  }
  return next
}

// How much one conversation adds to each count: nothing once archived (D-70).
function weight(item: ConversationItem) {
  const counted = !item.archived
  return {
    unread: counted && item.unreadCount > 0 ? 1 : 0,
    needsReply: counted && item.needsReply ? 1 : 0,
    withAttachments: counted && item.hasAttachments ? 1 : 0,
  }
}

/** The counts after one row changed from `before` to `after`, so the numbers move with the row before the server answers. */
export function countsAfter(counts: InboxCounts, before: ConversationItem, after: ConversationItem): InboxCounts {
  const was = weight(before)
  const is = weight(after)
  const unread = is.unread - was.unread
  const byProvider = counts.byProvider.some((entry) => entry.provider === after.provider)
    ? counts.byProvider.map((entry) => (entry.provider === after.provider ? { ...entry, unread: Math.max(0, entry.unread + unread) } : entry))
    : unread > 0
      ? [...counts.byProvider, { provider: after.provider, unread }]
      : counts.byProvider
  const byKind = counts.unreadByKind
  return {
    ...counts,
    unread: Math.max(0, counts.unread + unread),
    byProvider,
    needsReply: Math.max(0, counts.needsReply + is.needsReply - was.needsReply),
    withAttachments: Math.max(0, counts.withAttachments + is.withAttachments - was.withAttachments),
    unreadByKind: byKind && { ...byKind, [after.kind]: Math.max(0, byKind[after.kind] + unread) },
  }
}
