import type { AccountStatus, Instant, ProviderInfo, ProviderType } from '@/shared/domain'

/**
 * Data contract of the Tài khoản screens (D-42), handed to the backend. The fields marked "already" come from
 * `GET /api/accounts` as it is today; the others are what the screens need on top (see the change design.md). On the
 * real API, what the backend does not give yet is null and the screens leave it out (D-56).
 */

export type ChannelKind = 'INBOUND' | 'SEND' | 'ATTACHMENTS' | 'CONTACTS'

/** List screen: `GET /api/accounts`, extended. */
export interface AccountsData {
  generatedAt: Instant
  providers: ProviderInfo[]
  accounts: AccountItem[]
  /** Messages and emails stored for all accounts. */
  storedMessages: number | null
}

export interface AccountItem {
  // already in AccountResponse
  id: string
  provider: ProviderType
  externalAccountId: string
  displayName: string
  avatarUrl: string | null
  status: AccountStatus
  syncEnabled: boolean
  lastSyncedAt: Instant | null
  createdAt: Instant
  // to add
  /** 0..100 while the first sync runs, otherwise null. */
  syncProgress: number | null
  statusChangedAt: Instant | null
  access: { expiresAt: Instant | null; autoRenew: boolean; lastRenewedAt: Instant | null } | null
  storedMessages: number | null
  syncIntervalMinutes: number | null
  /** What Sino does with this account; `available` is false when the provider or the granted scopes do not allow it. */
  channels: { kind: ChannelKind; available: boolean; enabled: boolean }[]
}

/** Detail screen: `GET /api/accounts/{id}`, extended. Sections the backend does not have yet are null. */
export interface AccountExtras {
  scopes: { code: string; granted: boolean }[] | null
  sites: { total: number; items: AccountSite[] } | null
  syncRuns: SyncRun[] | null
  activity: AccountActivity[] | null
}

export interface AccountSite {
  name: string
  domain: string
  method: string
  sensitive: boolean
  since: Instant
}

export interface SyncRun {
  at: Instant
  result: 'OK' | 'SLOW' | 'FAILED'
  messages: number
  durationMs: number
}

export type AccountActivity =
  | { id: string; at: Instant; kind: 'SCOPE_GRANTED'; scope: string }
  | { id: string; at: Instant; kind: 'SITES_DETECTED'; count: number; method: string }
  | { id: string; at: Instant; kind: 'ACCOUNT_CONNECTED'; initialMessages: number; durationMinutes: number }
  | { id: string; at: Instant; kind: 'AUTH_EXPIRED' }
