import type { ProviderInfo } from '@/shared/domain'

/**
 * Data contract of the connect wizard (D-42, D-47…D-50), on top of the Tài khoản contract; see the change design.md.
 */

export type ConnectMethod = 'OAUTH2' | 'QR'

/** One provider of `GET /api/providers`, extended with what the wizard needs. */
export interface ConnectableProvider extends ProviderInfo {
  /** Already in the API: READ_MESSAGES, SEND_MESSAGES, ATTACHMENTS, ... */
  capabilities: string[]
  /** How the provider connects (D-285); OAUTH2 when omitted by older fixtures. */
  connectMethod?: ConnectMethod
  /** The provider has a connect flow and is turned on (D-285, D-286). */
  connectable: boolean
  /** To add: the scopes asked for when connecting, as short codes ("gmail.readonly"); null while the API does not tell. */
  scopes: string[] | null
}

/** `POST /api/accounts/connect/{provider}/qr` (ZL-07, D-275). */
export interface QrChallenge {
  loginId: string
  qrImage: string
  expiresAt: string
}

export type QrLoginStateName = 'WAITING' | 'SCANNED' | 'DONE' | 'EXPIRED' | 'DECLINED' | 'FAILED'

/** `GET /api/accounts/connect/{provider}/qr/{loginId}` (ZL-07, D-275). */
export interface QrConnectStatus {
  state: QrLoginStateName
  displayName?: string
  accountId?: string
  reconnected?: boolean
  code?: string
}

export type SyncRange = 'DAYS_30' | 'DAYS_90' | 'ALL'

/** What the first sync should take; a proposal for F04b (D-49). */
export interface SyncOptions {
  range: SyncRange
  labelsAsFilters: boolean
  attachmentsOnOpen: boolean
}

/** The options of step 4 as the canvas shows them first. */
export const DEFAULT_SYNC_OPTIONS: SyncOptions = { range: 'DAYS_90', labelsAsFilters: true, attachmentsOnOpen: true }

export interface SyncEstimate {
  messages: number
  minMinutes: number
  maxMinutes: number
}

/** Where the first import of an account is (BE-45). */
export type InitialSyncState = 'NOT_STARTED' | 'RUNNING' | 'DONE' | 'FAILED'

export interface InitialSyncStatus {
  state: InitialSyncState
  range: SyncRange | null
  /** Messages imported so far, new or updated: about 0 when an unchanged mailbox is imported again. */
  fetched: number
  /** The estimate taken when the import started; null when the provider gave none. */
  total: number | null
  remainingMinutes: number | null
  storedMessages: number
  /** Why a FAILED import stopped: RATE_LIMITED, PROVIDER_UNAVAILABLE, AUTH_EXPIRED, ACCOUNT_DISABLED, INTERNAL… */
  errorCode: string | null
}
