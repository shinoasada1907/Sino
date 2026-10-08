import { api } from '@/shared/api/client'
import type { AccountStatus, Instant, ProviderInfo } from '@/shared/domain'
import type { AccountExtras, AccountItem, AccountsData, ChannelKind } from './accounts.types'
import { createConnectProvidersSample, createInitialSyncSample, createSyncEstimateSample } from './connect.sample'
import type { ConnectableProvider, InitialSyncStatus, SyncEstimate, SyncOptions, SyncRange } from './connect.types'

/*
 * The requests of the Tài khoản screens. The list, its channel switch and removing an account use the backend API
 * (D-56): what the API does not give yet is null. Connecting still runs on sample data until FE-30.
 */

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

/** Later `GET /api/providers` with `connectable` and `scopes` (D-50). */
export async function fetchConnectProviders(): Promise<ConnectableProvider[]> {
  return createConnectProvidersSample()
}

/**
 * `POST /api/accounts/connect/{provider}` (BE-31), with `accountId` to sign an account in again. With sample data the
 * address goes straight back to the list, as the callback of BE-32 will: a new connect lands on the sample Gmail account.
 */
export async function startConnect(_provider: string, accountId: string | null): Promise<{ authorizationUrl: string }> {
  return { authorizationUrl: `/accounts?connected=${accountId ?? 'acc-gmail'}` }
}

/** Leaves Sino for the provider's sign-in page; the browser comes back through the callback. */
export function leaveTo(url: string): void {
  window.location.assign(url)
}

/** Later an estimate from F04b (Gmail `resultSizeEstimate`); null when there is none. */
export async function fetchSyncEstimate(_accountId: string, range: SyncRange): Promise<SyncEstimate | null> {
  return createSyncEstimateSample(range)
}

/** Later the start of the first sync of F04b, with the options of step 4 (D-49). */
export async function startInitialSync(_accountId: string, options: SyncOptions): Promise<InitialSyncStatus> {
  return createInitialSyncSample(options.range)
}
