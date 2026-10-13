import type { AccountStatus, Instant, ProviderInfo, ProviderType } from '@/shared/domain'
import type { InitialSyncStatus } from './connect.types'

/**
 * Data contract of the Tài khoản screens (D-42), handed to the backend. The fields marked "already" come from
 * `GET /api/accounts` as it is today; the others are what the screens need on top (see the change design.md). On the
 * real API, what the backend does not give yet is null and the screens leave it out (D-56).
 */

export type ChannelKind = 'INBOUND' | 'SEND' | 'ATTACHMENTS' | 'CONTACTS'

/** The live sync of an imported account (`GET /api/accounts/{id}/sync`, BE-48). */
export interface SyncStatus {
  importDone: boolean
  lastSyncAt: Instant | null
  lastError: string | null
  /** `ACTIVE` while the provider pushes changes (new mail at once); otherwise Sino asks about every minute. */
  push: 'ACTIVE' | 'OFF' | 'FAILED'
  pushExpiresAt: Instant | null
}

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
  /**
   * How the account is shown: its address (email, phone, user name). On the API, `address ?? displayName`: an account
   * connected before the backend kept addresses (BE-47) has none until it signs in again, and for Gmail its display
   * name is the email then.
   */
  address: string
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
  /** Its first import (BE-45); null when it could not be read, and in the sample data. */
  firstImport: InitialSyncStatus | null
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
