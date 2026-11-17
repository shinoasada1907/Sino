import { useSearchParams } from 'react-router'
import { folderOf, type InboxFilter, type InboxView } from './format'

export const VIEWS: InboxView[] = ['all', 'unread', 'reply', 'attachments', 'scheduled', 'snoozed', 'archived']

/**
 * "?account=acc-1&view=unread" or "?account=acc-1&folder=sent"; the defaults (every account, every source, the whole
 * inbox) leave the address clean. A folder replaces the view, so the two never meet in one address.
 */
export function filterSearch({ source, account, view, folder }: InboxFilter): string {
  const params = new URLSearchParams()
  if (source) {
    params.set('source', source)
  }
  if (account) {
    params.set('account', account)
  }
  if (folder) {
    params.set('folder', folder)
  } else if (view !== 'all') {
    params.set('view', view)
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

/**
 * The inbox filter lives in the address (`account`, `source`, `view`), so it survives a reload, works with Back, and is shared by
 * the sidebar, the account dropdown above the list and the chips of tablet and mobile. Unknown values fall back to the
 * defaults. `sources` is null while the providers are not known yet. `folder` (the mail folders of Hộp thư, D-502) is read
 * only where `withFolders` says so: Tin nhắn has none.
 */
export function useInboxFilter(sources: string[] | null, validAccounts?: string[] | null, withFolders = false): {
  filter: InboxFilter
  search: string
  searchFor: (change: Partial<InboxFilter>) => string
} {
  const [params] = useSearchParams()
  const source = params.get('source')
  const account = params.get('account')
  const view = params.get('view') as InboxView | null
  const folder = withFolders ? folderOf(params.get('folder')) : null
  const filter: InboxFilter = {
    source: source && (sources === null || sources.includes(source)) ? source : null,
    account: account && (validAccounts == null || validAccounts.includes(account)) ? account : null,
    view: !folder && view && VIEWS.includes(view) ? view : 'all',
    folder,
  }
  return { filter, search: filterSearch(filter), searchFor: (change) => filterSearch({ ...filter, ...change }) }
}
