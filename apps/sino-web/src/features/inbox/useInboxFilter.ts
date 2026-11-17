import { useSearchParams } from 'react-router'
import type { ProviderKind } from '@/shared/domain'
import { chatTypeOf, folderOf, type InboxFilter, type InboxView } from './format'

export const VIEWS: InboxView[] = ['all', 'unread', 'reply', 'attachments', 'scheduled', 'snoozed', 'archived']

/**
 * "?account=acc-1&view=unread&chat=group" or "?account=acc-1&folder=sent"; the defaults (every account, every chat, the
 * whole inbox) leave the address clean. A folder replaces the view, so the two never meet in one address.
 */
export function filterSearch({ account, chatType, view, folder }: InboxFilter): string {
  const params = new URLSearchParams()
  if (account) {
    params.set('account', account)
  }
  if (folder) {
    params.set('folder', folder)
  } else if (view !== 'all') {
    params.set('view', view)
  }
  if (chatType) {
    params.set('chat', chatType)
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

/**
 * The filter an address names, for the screen of `kind` (messages-by-account, D-428). An `account` that is not one of
 * `validAccounts` (unknown, deleted, of the other screen) means every account, and so does the old `?source=`, which is
 * not read. `validAccounts` is null while the accounts are not known yet. Only Hộp thư has `folder` (D-502), only Tin
 * nhắn has `chat`. Unknown values fall back to the defaults.
 */
export function readFilter(params: URLSearchParams, validAccounts: string[] | null, kind: ProviderKind): InboxFilter {
  const account = params.get('account')
  const view = params.get('view') as InboxView | null
  const folder = kind === 'EMAIL' ? folderOf(params.get('folder')) : null
  return {
    account: account && (validAccounts === null || validAccounts.includes(account)) ? account : null,
    chatType: kind === 'CHAT' ? chatTypeOf(params.get('chat')) : null,
    view: !folder && view && VIEWS.includes(view) ? view : 'all',
    folder,
  }
}

/**
 * The inbox filter lives in the address (`account`, `view`, `chat`, `folder`), so it survives a reload, works with Back,
 * and is shared by every control that sets it. `searchFor` is the address after changing some of it, with the rest kept.
 */
export function useInboxFilter(validAccounts: string[] | null, kind: ProviderKind): {
  filter: InboxFilter
  search: string
  searchFor: (change: Partial<InboxFilter>) => string
} {
  const [params] = useSearchParams()
  const filter = readFilter(params, validAccounts, kind)
  return { filter, search: filterSearch(filter), searchFor: (change) => filterSearch({ ...filter, ...change }) }
}
