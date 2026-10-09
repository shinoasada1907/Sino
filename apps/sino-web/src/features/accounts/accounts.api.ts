import { api } from '@/shared/api/client'
import type { AccountStatus, Instant, ProviderInfo } from '@/shared/domain'
import type { AccountExtras, AccountItem, AccountsData, ChannelKind } from './accounts.types'
import type { ConnectableProvider, InitialSyncState, InitialSyncStatus, SyncEstimate, SyncOptions, SyncRange } from './connect.types'

// The requests of the Tài khoản screens, on the backend API (D-56): what the API does not give yet is null.

/** One account of `GET /api/accounts` (F02). */
interface AccountResponse {
  id: string
  provider: string
  externalAccountId: string
  displayName: string
  avatarUrl: string | null
  status: AccountStatus
  syncEnabled: boolean
  lastSyncedAt: Instant | null
  capabilities: string[]
  createdAt: Instant
}

/** One provider of `GET /api/providers` (F03). */
interface ProviderResponse {
  type: string
  displayName: string
  capabilities: string[]
}

// The only channel the API can tell and change today: receiving, which is automatic sync (`syncEnabled`).
function toAccountItem(account: AccountResponse): AccountItem {
  return {
    id: account.id,
    provider: account.provider,
    externalAccountId: account.externalAccountId,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    status: account.status,
    syncEnabled: account.syncEnabled,
    lastSyncedAt: account.lastSyncedAt,
    createdAt: account.createdAt,
    syncProgress: null,
    statusChangedAt: null,
    access: null,
    storedMessages: null,
    syncIntervalMinutes: null,
    channels: [{ kind: 'INBOUND', available: account.capabilities.includes('READ_MESSAGES'), enabled: account.syncEnabled }],
  }
}

/** `GET /api/accounts` and `GET /api/providers`. */
export async function fetchAccounts(): Promise<AccountsData> {
  const [accounts, providers] = await Promise.all([api.get<AccountResponse[]>('/api/accounts'), api.get<ProviderResponse[]>('/api/providers')])
  return {
    generatedAt: new Date().toISOString(),
    providers: providers.map(({ type, displayName }): ProviderInfo => ({ type, displayName })),
    accounts: accounts.map(toAccountItem),
    storedMessages: null,
  }
}

/** The detail sections: the API has none of them yet, so nothing is asked. */
export async function fetchAccountExtras(_accountId: string): Promise<AccountExtras> {
  return { scopes: null, sites: null, syncRuns: null, activity: null }
}

/** `PATCH /api/accounts/{id}`: the inbound channel is automatic sync; the API has no other channel yet. */
export async function saveChannel({ accountId, kind, enabled }: { accountId: string; kind: ChannelKind; enabled: boolean }): Promise<void> {
  if (kind !== 'INBOUND') {
    throw new Error(`The API cannot change the ${kind} channel yet`)
  }
  await api.patch(`/api/accounts/${accountId}`, { syncEnabled: enabled })
}

/** `DELETE /api/accounts/{id}`: the access is revoked and deleted; the stored messages stay (F05 decides). */
export async function deleteAccount({ accountId }: { accountId: string }): Promise<void> {
  await api.delete(`/api/accounts/${accountId}`)
}

/**
 * `GET /api/providers`. Every provider it lists has a connector, and the only one so far (Gmail, F04a) connects through
 * OAuth2, so all are connectable; the backend adds `connectable` (D-50) once a provider without that flow exists. The
 * scopes asked for are not in the API yet: null.
 */
export async function fetchConnectProviders(): Promise<ConnectableProvider[]> {
  const providers = await api.get<ProviderResponse[]>('/api/providers')
  return providers.map(({ type, displayName, capabilities }) => ({ type, displayName, capabilities, connectable: true, scopes: null }))
}

/**
 * `POST /api/accounts/connect/{provider}` (BE-31), with `accountId` to sign an account in again; the provider's page
 * sends the browser back through the callback of BE-32 to `/accounts?connected=…` or `?connectError=…`.
 */
export async function startConnect(provider: string, accountId: string | null): Promise<{ authorizationUrl: string }> {
  return api.post(`/api/accounts/connect/${provider}`, accountId === null ? undefined : { accountId })
}

/** Leaves Sino for the provider's sign-in page; the browser comes back through the callback. */
export function leaveTo(url: string): void {
  window.location.assign(url)
}

/** `GET /api/accounts/{id}/initial-sync/estimate`: all three null when the provider cannot tell. */
interface EstimateResponse {
  messages: number | null
  minMinutes: number | null
  maxMinutes: number | null
}

/** `GET /api/accounts/{id}/initial-sync`, also the answer of its `POST` (BE-45). */
interface InitialSyncResponse {
  status: InitialSyncState
  range: SyncRange | null
  imported: number
  estimated: number | null
  remainingMinutes: number | null
  storedMessages: number
  errorCode: string | null
}

function toInitialSync({ status, range, imported, estimated, remainingMinutes, storedMessages, errorCode }: InitialSyncResponse): InitialSyncStatus {
  return { state: status, range, fetched: imported, total: estimated, remainingMinutes, storedMessages, errorCode }
}

/** How many messages the first import of `range` would take, and how long; null when the provider cannot tell. */
export async function fetchSyncEstimate(accountId: string, range: SyncRange): Promise<SyncEstimate | null> {
  const { messages, minMinutes, maxMinutes } = await api.get<EstimateResponse>(`/api/accounts/${accountId}/initial-sync/estimate?range=${range}`)
  return messages === null || minMinutes === null || maxMinutes === null ? null : { messages, minMinutes, maxMinutes }
}

/**
 * `POST /api/accounts/{id}/initial-sync`: starts the first import, or goes on with one that failed on the same range; while
 * one runs, the backend only answers its status. The two switches of step 4 have no API yet (F05 Open Questions).
 */
export async function startInitialSync(accountId: string, options: SyncOptions): Promise<InitialSyncStatus> {
  return toInitialSync(await api.post<InitialSyncResponse>(`/api/accounts/${accountId}/initial-sync`, { range: options.range }))
}

/** `GET /api/accounts/{id}/initial-sync`. */
export async function fetchInitialSync(accountId: string): Promise<InitialSyncStatus> {
  return toInitialSync(await api.get<InitialSyncResponse>(`/api/accounts/${accountId}/initial-sync`))
}
