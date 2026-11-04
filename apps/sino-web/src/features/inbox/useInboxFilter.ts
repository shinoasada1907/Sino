import { useSearchParams } from 'react-router'
import type { InboxFilter, InboxView } from './format'

export const VIEWS: InboxView[] = ['all', 'unread', 'reply', 'attachments', 'scheduled', 'snoozed', 'archived']

/** "?account=acc-1&view=unread"; the defaults (every account, every source, the whole inbox) leave the address clean. */
export function filterSearch({ source, account, view }: InboxFilter): string {
  const params = new URLSearchParams()
  if (source) {
    params.set('source', source)
  }
  if (account) {
    params.set('account', account)
  }
  if (view !== 'all') {
    params.set('view', view)
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

/**
 * The inbox filter lives in the address (`account`, `source`, `view`), so it survives a reload, works with Back, and is shared by
 * the sidebar, the account dropdown above the list and the chips of tablet and mobile. Unknown values fall back to the
 * defaults. `sources` is null while the providers are not known yet.
 */
export function useInboxFilter(sources: string[] | null, validAccounts?: string[] | null): {
  filter: InboxFilter
  search: string
  searchFor: (change: Partial<InboxFilter>) => string
} {
  const [params] = useSearchParams()
  const source = params.get('source')
  const account = params.get('account')
  const view = params.get('view') as InboxView | null
  const filter: InboxFilter = {
    source: source && (sources === null || sources.includes(source)) ? source : null,
    account: account && (validAccounts == null || validAccounts.includes(account)) ? account : null,
    view: view && VIEWS.includes(view) ? view : 'all',
  }
  return { filter, search: filterSearch(filter), searchFor: (change) => filterSearch({ ...filter, ...change }) }
}
