import { api } from '@/shared/api/client'
import { toProviderInfo, type ProviderEntry } from '@/shared/api/providers'
import type { AccountStatus, Instant } from '@/shared/domain'
import type { AccountExtras, AccountItem, AccountsData, ChannelKind, SyncStatus } from './accounts.types'
import { initialSyncView } from './connect.format'
import type {
  ConnectableProvider,
  InitialSyncState,
  InitialSyncStatus,
  QrChallenge,
  QrConnectStatus,
  SyncEstimate,
  SyncOptions,
  SyncRange,
} from './connect.types'

// The requests of the Tài khoản screens, on the backend API (D-56): what the API does not give yet is null.

/** One account of `GET /api/accounts` (F02). */
interface AccountResponse {
  id: string
  provider: string
  externalAccountId: string
  displayName: string
  /** Since BE-47; null for an account connected before, until it signs in again. */
  address: string | null
  avatarUrl: string | null
  status: AccountStatus
  syncEnabled: boolean
  lastSyncedAt: Instant | null
  capabilities: string[]
  createdAt: Instant
}

/** One provider of `GET /api/providers` (F03); `connectMethod` and `connectable` since ZL-07 (D-285). */
interface ProviderResponse extends ProviderEntry {
  capabilities: string[]
  connectMethod?: 'OAUTH2' | 'QR' | null
  connectable?: boolean
}

// The only channel the API can tell and change today: receiving, which is automatic sync (`syncEnabled`).
function toAccountItem(account: AccountResponse): AccountItem {
  return {
    id: account.id,
    provider: account.provider,
    externalAccountId: account.externalAccountId,
    displayName: account.displayName,
    address: account.address ?? account.displayName,
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
    firstImport: null,
  }
}

/** The account with its first import: the share while it runs, and the messages stored so far. */
export function withFirstImport(account: AccountItem, status: InitialSyncStatus | null): AccountItem {
  if (status === null) {
    return account
  }
  const syncProgress = status.state === 'RUNNING' ? initialSyncView(status).percent : null
  return { ...account, firstImport: status, syncProgress, storedMessages: status.storedMessages }
}

/** `GET /api/accounts`, `GET /api/providers`, and the first import of each account (BE-45). */
export async function fetchAccounts(): Promise<AccountsData> {
  const [accounts, providers] = await Promise.all([api.get<AccountResponse[]>('/api/accounts'), api.get<ProviderResponse[]>('/api/providers')])
  // An import status that cannot be read leaves its account as the list gives it, rather than failing the list.
  const imports = await Promise.all(accounts.map((account) => fetchInitialSync(account.id).catch(() => null)))
  return {
    generatedAt: new Date().toISOString(),
    providers: providers.map(toProviderInfo),
    accounts: accounts.map((account, index) => withFirstImport(toAccountItem(account), imports[index])),
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
 * `GET /api/providers`. A provider can be connected when the API says so (D-285): Zalo turned off is listed and is not
 * (D-286). A backend from before `connectable` listed only providers that connect over OAuth2: connectable. The scopes
 * asked for are not in the API yet: null.
 */
export async function fetchConnectProviders(): Promise<ConnectableProvider[]> {
  const providers = await api.get<ProviderResponse[]>('/api/providers')
  return providers.map((provider) => {
    const connectMethod = provider.connectMethod ?? 'OAUTH2'
    return {
      ...toProviderInfo(provider),
      capabilities: provider.capabilities,
      connectMethod,
      connectable: (provider.connectable ?? true) && provider.connectMethod !== null,
      scopes: null,
    }
  })
}

/**
 * `POST /api/accounts/connect/{provider}` (BE-31), with `accountId` to sign an account in again; the provider's page
 * sends the browser back through the callback of BE-32 to `/accounts?connected=…` or `?connectError=…`.
 */
export async function startConnect(provider: string, accountId: string | null): Promise<{ authorizationUrl: string }> {
  return api.post(`/api/accounts/connect/${provider}`, accountId === null ? undefined : { accountId })
}

/** `POST /api/accounts/connect/{provider}/qr` (ZL-07, D-272, D-275): starts a QR login once the user accepted the risk. */
export async function startQrConnect(provider: string, accountId: string | null): Promise<QrChallenge> {
  return api.post(`/api/accounts/connect/${provider}/qr`, {
    acceptRisk: true,
    ...(accountId === null ? {} : { accountId }),
  })
}

/** `GET /api/accounts/connect/{provider}/qr/{loginId}` (ZL-07, D-275): asks where a QR login is. */
export async function fetchQrStatus(provider: string, loginId: string): Promise<QrConnectStatus> {
  return api.get(`/api/accounts/connect/${provider}/qr/${loginId}`)
}

/** `DELETE /api/accounts/connect/{provider}/qr/{loginId}` (ZL-07, D-275): cancels a pending QR login when the dialog closes. */
export async function cancelQrConnect(provider: string, loginId: string): Promise<void> {
  await api.delete(`/api/accounts/connect/${provider}/qr/${loginId}`)
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

/** `GET /api/accounts/{id}/sync`: when the account last synced, its last error, and whether the provider pushes. */
export async function fetchSyncStatus(accountId: string): Promise<SyncStatus> {
  return api.get<SyncStatus>(`/api/accounts/${accountId}/sync`)
}

/** `POST /api/accounts/{id}/sync`: reads what changed since the last sync, not the whole range again (D-95). */
export async function requestSync(accountId: string): Promise<SyncStatus> {
  return api.post<SyncStatus>(`/api/accounts/${accountId}/sync`)
}
