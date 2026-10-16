import type { ProviderInfo, ProviderKind, ProviderType } from '@/shared/domain'
import type { InboxData } from './inbox.types'

/** One of the two screens of conversations (f05c, D-300): chats live in Tin nhắn, emails in Hộp thư. */
export interface InboxScreen {
  kind: ProviderKind
  /** Where the screen lists its conversations; an open one is `${path}/:id`. */
  path: '/messages' | '/inbox'
  title: 'Tin nhắn' | 'Hộp thư'
}

export const SCREENS: Record<ProviderKind, InboxScreen> = {
  CHAT: { kind: 'CHAT', path: '/messages', title: 'Tin nhắn' },
  EMAIL: { kind: 'EMAIL', path: '/inbox', title: 'Hộp thư' },
}

/** A provider missing from the catalog counts as email, as the backend counts it (f05c, D-308). */
export function kindOfProvider(providers: ProviderInfo[], type: ProviderType): ProviderKind {
  return providers.find((provider) => provider.type === type)?.kind ?? 'EMAIL'
}

/** The frame as one screen shows it: its own providers and accounts; the counts are already those of its kind. */
export function screenFrame(inbox: InboxData, kind: ProviderKind): InboxData {
  return {
    ...inbox,
    providers: inbox.providers.filter((provider) => provider.kind === kind),
    accounts: inbox.accounts.filter((account) => kindOfProvider(inbox.providers, account.provider) === kind),
  }
}
