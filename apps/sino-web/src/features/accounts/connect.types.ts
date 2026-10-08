import type { ProviderInfo } from '@/shared/domain'

/**
 * Data contract of the connect wizard (D-42, D-47…D-50), on top of the Tài khoản contract; see the change design.md.
 */

/** One provider of `GET /api/providers`, extended with what the wizard needs. */
export interface ConnectableProvider extends ProviderInfo {
  /** Already in the API: READ_MESSAGES, SEND_MESSAGES, ATTACHMENTS, ... */
  capabilities: string[]
  /** To add: the provider has a connect flow (an OAuth2 connector). */
  connectable: boolean
  /** To add: the scopes asked for when connecting, as short codes ("gmail.readonly"). */
  scopes: string[]
}

export type SyncRange = 'DAYS_30' | 'DAYS_90' | 'ALL'

/** What the first sync should take; a proposal for F04b (D-49). */
export interface SyncOptions {
  range: SyncRange
  labelsAsFilters: boolean
  attachmentsOnOpen: boolean
}

export interface SyncEstimate {
  messages: number
  minMinutes: number
  maxMinutes: number
}

export interface InitialSyncStatus {
  fetched: number
  total: number | null
  remainingMinutes: number | null
}
