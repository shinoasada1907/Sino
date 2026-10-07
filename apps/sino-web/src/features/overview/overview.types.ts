import type { Instant } from '@/app/shell/shell.types'

/**
 * Data contract of the Tổng quan screen (D-42), handed to the backend. The API sends raw values (UTC instants,
 * counts, codes); the screen turns them into text. A section the backend does not provide yet is `null`.
 */

/** A provider type as the API names it: "gmail", "zalo", "messenger". */
export type ProviderType = string

/** Same values as `AccountStatus` in the backend. */
export type AccountStatus = 'CONNECTED' | 'DEGRADED' | 'AUTH_EXPIRED' | 'ERROR' | 'DISABLED'

export type Health = 'OK' | 'WARNING' | 'ERROR'

export interface OverviewData {
  generatedAt: Instant
  /** The provider catalog (`GET /api/providers`), to name providers without hard-coding them. */
  providers: { type: ProviderType; displayName: string }[]
  accounts: OverviewAccount[]
  inbox: InboxSummary | null
  today: TodaySummary | null
  syncActivity: SyncActivity | null
  registrations: RegistrationSummary | null
  activity: ActivityItem[] | null
}

export interface OverviewAccount {
  id: string
  provider: ProviderType
  externalAccountId: string
  displayName: string
  status: AccountStatus
  lastSyncedAt: Instant | null
  /** 0..100 while the first sync runs, otherwise null. */
  syncProgress: number | null
  /** When the account entered its current status, for example AUTH_EXPIRED. */
  statusChangedAt: Instant | null
}

export interface InboxSummary {
  unreadCount: number
  awaitingReplyCount: number
  bySource: { provider: ProviderType; unreadCount: number }[]
  conversations: InboxConversation[]
}

export interface InboxConversation {
  id: string
  provider: ProviderType
  /** The other person or the group. */
  title: string
  /** Email subject; null for chats. */
  subject: string | null
  /** Number of people in a group chat; null for one-to-one. */
  memberCount: number | null
  snippet: string
  lastMessageAt: Instant
  unreadCount: number
}

export interface TodaySummary {
  items: TodayItem[]
  tomorrow: { firstEvent: { title: string; at: Instant } | null; taskCount: number }
}

export interface TodayItem {
  id: string
  kind: 'TASK' | 'EVENT' | 'REMINDER'
  title: string
  /** Due time of a task or reminder, start of an event. */
  at: Instant
  done: boolean
  recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null
  /** The conversation the item came from. */
  conversation: { provider: ProviderType; title: string } | null
}

export interface SyncActivity {
  /** 24 hourly buckets, oldest first; the last one is the current hour. */
  buckets: { start: Instant; messages: number; health: Health }[]
  providers: { provider: ProviderType; health: Health; since: Instant | null }[]
}

export interface RegistrationSummary {
  total: number
  updatedAt: Instant
  /** Sign-in methods, biggest first: "google", "email", "facebook", "zalo". */
  byMethod: { method: string; count: number }[]
  latest: { siteName: string; domain: string; method: string; detectedAt: Instant; isNew: boolean } | null
}

export type ActivityItem =
  | { id: string; at: Instant; kind: 'SYNC_RECOVERED'; provider: ProviderType; downtimeMinutes: number }
  | { id: string; at: Instant; kind: 'REGISTRATION_DETECTED'; siteName: string; method: string }
  | { id: string; at: Instant; kind: 'AUTH_EXPIRED'; provider: ProviderType }
  | { id: string; at: Instant; kind: 'ACCOUNT_CONNECTED'; provider: ProviderType; externalAccountId: string }
