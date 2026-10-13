import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCalendar, useCalendarView } from './useCalendar'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')

// Renders a hook inside a router at `path`, with the query of the address next to its value.
function renderAt<T>(path: string, hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  const { result } = renderHook(() => ({ value: hook(), search: useLocation().search }), { wrapper })
  return () => result.current
}

describe('useCalendarView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on the week of today, keeping the address clean', () => {
    const state = renderAt('/calendar', useCalendarView)
    expect(state().value).toMatchObject({ view: 'week', anchor: '2026-10-02', today: '2026-10-02', search: '' })
  })

  it('reads the view and the day from the address, and ignores what it does not know', () => {
    expect(renderAt('/calendar?view=month&date=2026-11-15', useCalendarView)().value).toMatchObject({ view: 'month', anchor: '2026-11-15', search: '?view=month&date=2026-11-15' })
    expect(renderAt('/calendar?view=day&date=15-11-2026', useCalendarView)().value).toMatchObject({ view: 'week', anchor: '2026-10-02', search: '' })
  })

  it('moves a range before or after, back to today, and to another view keeping the day', async () => {
    const state = renderAt('/calendar', useCalendarView)

    act(() => state().value.shift(1))
    await waitFor(() => expect(state().search).toBe('?date=2026-10-09'))

    act(() => state().value.setView('month'))
    await waitFor(() => expect(state().search).toBe('?view=month&date=2026-10-09'))

    act(() => state().value.shift(-1))
    await waitFor(() => expect(state().search).toBe('?view=month&date=2026-09-09'))

    act(() => state().value.goToday())
    await waitFor(() => expect(state().search).toBe('?view=month'))
  })
})

describe('useCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the range it is asked for', async () => {
    const state = renderAt('/calendar', () => useCalendar({ from: '2026-09-28', to: '2026-10-05' }))
    await waitFor(() => expect(state().value.data?.events.map((event) => event.id)).toContain('event-call'))
    expect(state().value.data).toMatchObject({ from: '2026-09-28', to: '2026-10-05' })
  })
})
