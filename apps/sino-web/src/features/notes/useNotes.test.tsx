import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotesSample } from './notes.sample'
import { NOTES_QUERY_KEY, useCreateNote, useDeleteNote, useNote, useNotes, useSaveNote } from './useNotes'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(NOTES_QUERY_KEY, createNotesSample(NOW))
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result } = renderHook(
    () => ({ notes: useNotes(), clause: useNote('note-clause'), create: useCreateNote(), save: useSaveNote(), remove: useDeleteNote() }),
    { wrapper },
  )
  return { result, notes: () => result.current.notes.data?.notes ?? [] }
}

describe('the notes hooks on sample data (NT-01)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('finds a note by its ID, and says when there is none', () => {
    const { result } = setup()
    expect(result.current.clause).toMatchObject({ note: { title: 'Điều khoản 4 — thời hạn thanh toán' }, notFound: false })
  })

  it('creates a standalone note with its text, the title empty when not given (D-202, D-203)', async () => {
    const { result, notes } = setup()

    let created: { id: string } | undefined
    await act(async () => {
      created = await result.current.create.mutateAsync({ title: '', body: 'Gọi lại cho phòng khám' })
    })

    // The cache tells the component on the next tick.
    await waitFor(() => expect(notes()[0]).toMatchObject({ id: created?.id, title: null, body: 'Gọi lại cho phòng khám', pinned: false, anchor: null, updatedAt: NOW.toISOString() }))
    expect(notes()).toHaveLength(7)
  })

  it('saves an edit as the newest one, and a pin without changing when it was edited', async () => {
    const { result, notes } = setup()
    const clause = result.current.clause.note!
    const trip = notes().find((entry) => entry.id === 'note-trip')!

    await act(async () => {
      await result.current.save.mutateAsync({ note: clause, change: { body: 'Hỏi lại kế toán.' } })
      await result.current.save.mutateAsync({ note: trip, change: { pinned: true } })
    })

    await waitFor(() => expect(notes().find((entry) => entry.id === 'note-clause')).toMatchObject({ body: 'Hỏi lại kế toán.', updatedAt: NOW.toISOString() }))
    expect(notes().find((entry) => entry.id === 'note-trip')).toMatchObject({ pinned: true, updatedAt: trip.updatedAt })
  })

  it('deletes a note', async () => {
    const { result, notes } = setup()

    await act(async () => {
      await result.current.remove.mutateAsync(result.current.clause.note!)
    })

    await waitFor(() => expect(notes().map((entry) => entry.id)).not.toContain('note-clause'))
    expect(result.current.clause).toMatchObject({ note: undefined, notFound: true })
  })
})
