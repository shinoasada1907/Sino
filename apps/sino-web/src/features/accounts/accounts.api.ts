import { createAccountExtrasSample, createAccountsSample } from './accounts.sample'
import type { AccountExtras, AccountsData, ChannelKind } from './accounts.types'

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
