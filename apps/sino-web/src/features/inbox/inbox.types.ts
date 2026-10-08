import type { AccountStatus, Instant, ProviderInfo, ProviderType } from '@/shared/domain'

/**
 * Data contract of the Hộp thư screens (D-42), handed to the backend for F05 and F06; see the change design.md.
 */

export type ConversationKind = 'EMAIL' | 'CHAT'
export type LinkedKind = 'TASK' | 'EVENT' | 'NOTE'

/** List screen: `GET /api/conversations`, extended. */
export interface InboxData {
  generatedAt: Instant
  providers: ProviderInfo[]
  accounts: InboxAccount[]
  /** Over every conversation, not only the loaded page. */
  counts: InboxCounts
  /** Newest first. */
  conversations: ConversationItem[]
  /** The next page (infinite scroll comes later). */
  nextCursor: string | null
}

export interface InboxAccount {
  id: string
  provider: ProviderType
  externalAccountId: string
  status: AccountStatus
  syncProgress: number | null
}

export interface InboxCounts {
  /** Unread messages ("12 chưa đọc"). */
  unread: number
  byProvider: { provider: ProviderType; unread: number }[]
  needsReply: number
  withAttachments: number
  scheduled: number
  snoozed: number
}

export interface ConversationItem {
  id: string
  accountId: string
  provider: ProviderType
  kind: ConversationKind
  /** The other person or the group. */
  title: string
  /** Email subject; null for chats. */
  subject: string | null
  /** Size of a group chat; null otherwise. */
  memberCount: number | null
  /** Who sent the last message of a group ("Hà"); null for one-to-one. */
  snippetFrom: string | null
  snippet: string
  /** The last delivered message; one still sending does not count. */
  lastMessageAt: Instant
  unreadCount: number
  needsReply: boolean
  hasAttachments: boolean
  archived: boolean
  snooze: { until: Instant | null; resurfacedAt: Instant | null } | null
  scheduledSend: { at: Instant; failed: boolean } | null
  /** Due time of a task, start of an appointment; null for a note. */
  linked: { kind: LinkedKind; at: Instant | null; allDay: boolean }[]
}

/** Detail: `GET /api/conversations/{id}` + `GET /api/conversations/{id}/messages` (F06). */
export interface ConversationDetail {
  id: string
  /** Oldest first. */
  messages: Message[]
  /** Where the "N tin chưa đọc" line goes. */
  firstUnreadId: string | null
  linked: LinkedItem[] | null
  members: Member[] | null
  files: { total: number; items: SharedFile[] } | null
  /** False when sending is not possible, for example the access expired. */
  canSend: boolean
  previousCursor: string | null
}

export interface LinkedItem {
  id: string
  kind: LinkedKind
  title: string
  at: Instant | null
  allDay: boolean
  remindAt: Instant | null
  pinned: boolean
}

export interface Attachment {
  name: string
  /** "PDF", "XLSX", "JPG" */
  type: string
  sizeBytes: number
  image: boolean
  caption: string | null
}

export type Message =
  | {
      id: string
      kind: 'MESSAGE'
      direction: 'IN' | 'OUT'
      sender: string
      to: string | null
      at: Instant
      /** Plain text; paragraphs are separated by an empty line (D-53). */
      text: string
      attachments: Attachment[]
      /** For own messages. */
      status: 'SENDING' | 'SENT' | 'SEEN' | 'FAILED' | null
      linked: { kind: LinkedKind; title: string }[]
    }
  | { id: string; kind: 'SYSTEM'; at: Instant; text: string }

export interface Member {
  name: string
  owner: boolean
  joinedRecently: boolean
}

export interface SharedFile {
  name: string
  type: string
  sizeBytes: number
  at: Instant
}
