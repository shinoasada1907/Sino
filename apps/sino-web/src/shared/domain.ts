// Types shared by every screen's data contract (D-42): they mirror what the backend API sends.

/** ISO-8601 instant in UTC, as the API sends it. */
export type Instant = string

/** A provider type as the API names it: "gmail", "zalo", "messenger". */
export type ProviderType = string

/** Same values as `AccountStatus` in the backend. */
export type AccountStatus = 'CONNECTED' | 'DEGRADED' | 'AUTH_EXPIRED' | 'ERROR' | 'DISABLED'

/** One entry of the provider catalog (`GET /api/providers`). */
export interface ProviderInfo {
  type: ProviderType
  displayName: string
}
