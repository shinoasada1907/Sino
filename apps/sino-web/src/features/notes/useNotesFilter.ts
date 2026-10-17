import { useSearchParams } from 'react-router'
import type { NotesFilter } from './notes.types'

const FILTERS: NotesFilter[] = ['all', 'linked', 'pinned', 'diagram']

/**
 * The filter and the search of the list live in the address (`?filter=linked|pinned|diagram&q=…`), so a reload, Back
 * and a shared link keep them, and opening a note carries them along (D-205). "Tất cả" and an empty search leave it
 * clean; typing replaces the entry instead of adding one per letter. `search` holds only the filter and the search, for
 * the links; changing them keeps the `kind` of a new note (`/notes/new?kind=diagram`, fe-ui-diagram-notes), so the open
 * new diagram stays one.
 */
export function useNotesFilter(): {
  filter: NotesFilter
  query: string
  search: string
  setFilter: (filter: NotesFilter) => void
  setQuery: (query: string) => void
} {
  const [params, setParams] = useSearchParams()
  const value = params.get('filter') as NotesFilter | null
  const filter = value && FILTERS.includes(value) ? value : 'all'
  const query = params.get('q') ?? ''
  const kind = params.get('kind')
  const paramsOf = (nextFilter: NotesFilter, nextQuery: string) => {
    const next = new URLSearchParams()
    if (nextFilter !== 'all') {
      next.set('filter', nextFilter)
    }
    if (nextQuery !== '') {
      next.set('q', nextQuery)
    }
    return next
  }
  const withKind = (next: URLSearchParams) => {
    if (kind !== null) {
      next.set('kind', kind)
    }
    return next
  }
  const current = paramsOf(filter, query).toString()
  return {
    filter,
    query,
    search: current ? `?${current}` : '',
    setFilter: (next) => setParams(withKind(paramsOf(next, query))),
    setQuery: (next) => setParams(withKind(paramsOf(filter, next)), { replace: true }),
  }
}
