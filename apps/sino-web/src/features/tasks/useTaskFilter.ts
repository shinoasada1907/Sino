import { useSearchParams } from 'react-router'
import type { TaskFilter } from './format'

const FILTERS: TaskFilter[] = ['all', 'messages', 'repeat']

/**
 * The filter of the list lives in the address (`?filter=messages|repeat`), so a reload, Back and a shared link keep it,
 * and opening or closing a task carries it along. "Tất cả" leaves the address clean; an unknown value is "Tất cả".
 */
export function useTaskFilter(): { filter: TaskFilter; search: string; setFilter: (filter: TaskFilter) => void } {
  const [params, setParams] = useSearchParams()
  const value = params.get('filter') as TaskFilter | null
  const filter = value && FILTERS.includes(value) ? value : 'all'
  return {
    filter,
    search: filter === 'all' ? '' : `?filter=${filter}`,
    setFilter: (next) => setParams(next === 'all' ? {} : { filter: next }),
  }
}
