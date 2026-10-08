import type { ConnectableProvider, InitialSyncStatus, SyncEstimate, SyncRange } from './connect.types'

/**
 * The provider catalog of the wizard, as `GET /api/providers` would return it. Only Gmail has a connect flow today
 * (D-50); the others are listed as "Sắp có".
 */
export function createConnectProvidersSample(): ConnectableProvider[] {
  return [
    { type: 'gmail', displayName: 'Gmail', capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'], connectable: true, scopes: ['gmail.readonly', 'userinfo.email'] },
    { type: 'zalo', displayName: 'Zalo', capabilities: ['READ_MESSAGES'], connectable: false, scopes: [] },
    { type: 'messenger', displayName: 'Messenger', capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'], connectable: false, scopes: [] },
    { type: 'google', displayName: 'Google', capabilities: ['REGISTRATIONS'], connectable: false, scopes: [] },
    { type: 'telegram', displayName: 'Telegram', capabilities: ['READ_MESSAGES'], connectable: false, scopes: [] },
  ]
}

// The canvas shows 90 days: about 1.180 emails in 3-5 minutes, then 412 of them after the first moments.
const ESTIMATES: Record<SyncRange, SyncEstimate> = {
  DAYS_30: { messages: 420, minMinutes: 1, maxMinutes: 2 },
  DAYS_90: { messages: 1180, minMinutes: 3, maxMinutes: 5 },
  ALL: { messages: 6400, minMinutes: 15, maxMinutes: 25 },
}

const FIRST_PROGRESS: Record<SyncRange, InitialSyncStatus> = {
  DAYS_30: { fetched: 147, total: 420, remainingMinutes: 1 },
  DAYS_90: { fetched: 412, total: 1180, remainingMinutes: 3 },
  ALL: { fetched: 2240, total: 6400, remainingMinutes: 16 },
}

export function createSyncEstimateSample(range: SyncRange): SyncEstimate | null {
  return ESTIMATES[range]
}

export function createInitialSyncSample(range: SyncRange): InitialSyncStatus {
  return FIRST_PROGRESS[range]
}
