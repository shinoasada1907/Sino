import { createAccountsSample } from '@/features/accounts/accounts.sample'
import type { AccountsData } from '@/features/accounts/accounts.types'
import type { AccountStatus } from '@/shared/domain'

/** The accounts sample reduced to one account per given status, so a test says exactly which accounts exist. */
export function accountsWithStatus(...statuses: AccountStatus[]): AccountsData {
  const sample = createAccountsSample(new Date())
  return { ...sample, accounts: statuses.map((status, index) => ({ ...sample.accounts[0], id: `acc-${index}`, status })) }
}
