import type { AccountStatus, Instant, ProviderInfo, ProviderType } from '@/shared/domain'

/**
 * Data contract of the Hộp thư screens (D-42), handed to the backend for F05 and F06; see the change design.md.
 */

export type ConversationKind = 'EMAIL' | 'CHAT'
export type LinkedKind = 'TASK' | 'EVENT' | 'NOTE'

/** The frame of the list screen: `GET /api/accounts`, `GET /api/providers`, `GET /api/conversations/counts`. */
export interface InboxData {
  generatedAt: Instant
  providers: ProviderInfo[]
  accounts: InboxAccount[]
  /** Over every conversation, not only the loaded pages. */
  counts: InboxCounts
}

/** One page of `GET /api/conversations` for a view and a source, newest first. */
export interface ConversationPage {
  items: ConversationItem[]
  /** The next page; null on the last one. */
  nextCursor: string | null
}

/** One page of `GET /api/conversations/{id}/messages` (F06), newest first. */
export interface MessagePage {
  items: Message[]
  /** The older messages; null on the last page. */
  nextCursor: string | null
}

/** `GET /api/conversations/{id}/messages/{messageId}/body` (F06): the HTML the backend cleaned, or null for text. */
export interface MessageBody {
  format: 'TEXT' | 'HTML'
  html: string | null
  /** The HTML has pictures from the web, held back until the reader asks (D-121). */
  remoteImages: boolean
}

/** An open conversation: `GET /api/conversations/{id}` (its row and its people); its messages have their own request (F06). */
export interface OpenConversation {
  item: ConversationItem
  detail: ConversationDetail
}

export interface InboxAccount {
  id: string
  provider: ProviderType
  externalAccountId: string
  /** How the account is shown: `address ?? displayName` of the API (BE-47), as on the Tài khoản screens. */
  address: string
  status: AccountStatus
  syncProgress: number | null
  /** When the status last changed: for an expired account, since when nothing arrives (D-55). */
  statusChangedAt: Instant | null
}

/** Counts of conversations that are not archived (D-70). */
export interface InboxCounts {
  /** Conversations with an unread message ("12 chưa đọc"). */
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
  /** Oldest first; null until the API returns messages (F06, D-71). */
  messages: Message[] | null
  /** Where the "N tin chưa đọc" line goes. */
  firstUnreadId: string | null
  linked: LinkedItem[] | null
  members: Member[] | null
  files: { total: number; items: SharedFile[] } | null
  /** False when sending is not possible, for example the access expired; null until Sino can send at all (F10, D-72). */
  canSend: boolean | null
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
  /** Null when the provider did not say (F06). */
  sizeBytes: number | null
  image: boolean
  caption: string | null
  /** Where Sino downloads it (F06, D-125); absent in the sample data. */
  url?: string
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
      /**
       * `HTML` or `UNCHECKED` (imported before F06): the full content is asked for when the email is open (D-123).
       * Absent for a message that is only text, as in the sample data or one just sent.
       */
      bodyFormat?: 'TEXT' | 'HTML' | 'UNCHECKED'
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
  /** Photos show as thumbnails, other files as rows. */
  image: boolean
  at: Instant
}
