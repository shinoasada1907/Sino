import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/problem'
import { createNote, deleteNote, fetchNotes, saveNote } from './notes.api'
import type { NoteChange, NoteItem, NotesData } from './notes.types'

/** The state of the navigation from `/notes/new` to the note it became: the same editor stays, typing goes on (D-203). */
export const FROM_NEW = { noteFromNew: true }

/** Every note of the owner (F15). Read again when the page comes back to the front, so another tab's edits show up (D-178). */
export const NOTES_QUERY_KEY = ['notes'] as const

export function useNotes() {
  return useQuery({ queryKey: NOTES_QUERY_KEY, queryFn: fetchNotes })
}

/** One note of the list; `notFound` once the list is there without it. */
export function useNote(noteId: string | undefined): { note: NoteItem | undefined; notFound: boolean } {
  const { data } = useNotes()
  const note = noteId === undefined ? undefined : data?.notes.find((entry) => entry.id === noteId)
  return { note, notFound: data !== undefined && noteId !== undefined && note === undefined }
}

function editNotes(queryClient: QueryClient, change: (notes: NoteItem[]) => NoteItem[]) {
  queryClient.setQueryData<NotesData>(NOTES_QUERY_KEY, (current) => current && { ...current, notes: change(current.notes) })
}

/** A new standalone note, made once it has text (D-203). */
export function useCreateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createNote,
    onSuccess: (created) => editNotes(queryClient, (notes) => [created, ...notes]),
  })
}

/**
 * A save of the title, the text or the diagram (autosave, D-203), or a pin: the note it answers, with its new version,
 * takes the place of the old one in the list. A 409 or a 404 reaches the caller as an `ApiError` (D-178).
 */
export function useSaveNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ note, change }: { note: NoteItem; change: NoteChange }) => saveNote(note, change),
    onSuccess: (saved) => editNotes(queryClient, (notes) => notes.map((entry) => (entry.id === saved.id ? saved : entry))),
  })
}

/** A note that is already gone (deleted from another place) is as deleted as one this call deleted. */
async function removeNote(note: NoteItem): Promise<void> {
  try {
    await deleteNote(note)
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) {
      throw error
    }
  }
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: removeNote,
    onSuccess: (_, note) => editNotes(queryClient, (notes) => notes.filter((entry) => entry.id !== note.id)),
  })
}
