import { createAccountExtrasSample, createAccountsSample } from './accounts.sample'
import type { AccountExtras, AccountsData, ChannelKind } from './accounts.types'
import { createConnectProvidersSample, createInitialSyncSample, createSyncEstimateSample } from './connect.sample'
import type { ConnectableProvider, InitialSyncStatus, SyncEstimate, SyncOptions, SyncRange } from './connect.types'

/*
 * The requests of the Tài khoản screens. They return sample data until the backend has the contract (D-42, D-45);
 * connecting the API means changing only the bodies below.
 */

/** Later `GET /api/accounts`. */
export async function fetchAccounts(): Promise<AccountsData> {
  return createAccountsSample(new Date())
}

/** Later the detail sections of `GET /api/accounts/{id}`. */
export async function fetchAccountExtras(accountId: string): Promise<AccountExtras> {
  return createAccountExtrasSample(accountId, new Date())
}

/** Later `PATCH /api/accounts/{id}` with `{ channels: { [kind]: enabled } }`. */
export async function saveChannel(_change: { accountId: string; kind: ChannelKind; enabled: boolean }): Promise<void> {}

/** Later `DELETE /api/accounts/{id}?deleteMessages=…`. */
export async function deleteAccount(_request: { accountId: string; deleteMessages: boolean }): Promise<void> {}


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
