import { useSearchParams } from 'react-router'
import type { InboxFilter, InboxView } from './format'

const VIEWS: InboxView[] = ['all', 'unread', 'reply', 'attachments', 'scheduled', 'snoozed', 'archived']

/** "?source=zalo&view=unread"; the defaults (every source, the whole inbox) leave the address clean. */
export function filterSearch({ source, view }: InboxFilter): string {
  const params = new URLSearchParams()
  if (source) {
    params.set('source', source)
  }
  if (view !== 'all') {
    params.set('view', view)
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

/**
 * The inbox filter lives in the address (`source`, `view`), so it survives a reload, works with Back, and is shared by
 * the source column, the buttons above the list and the chips of tablet and mobile. Unknown values fall back to the
 * defaults.
 */
export function useInboxFilter(sources: string[]): {
  filter: InboxFilter
  search: string
  searchFor: (change: Partial<InboxFilter>) => string
} {
  const [params] = useSearchParams()
  const source = params.get('source')
  const view = params.get('view') as InboxView | null
  const filter: InboxFilter = {
    source: source && sources.includes(source) ? source : null,
    view: view && VIEWS.includes(view) ? view : 'all',
  }
  return { filter, search: filterSearch(filter), searchFor: (change) => filterSearch({ ...filter, ...change }) }
}
