import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createNote, deleteNote, fetchNotes, saveNote } from './notes.api'
import type { NoteChange, NoteItem, NotesData } from './notes.types'

/** Every note of the owner (D-42: sample data until F15). */
export const NOTES_QUERY_KEY = ['notes'] as const

export function useNotes() {
  // The sample lives in the cache for the life of the page; reading it again would undo the edits (D-203).
  return useQuery({ queryKey: NOTES_QUERY_KEY, queryFn: fetchNotes, staleTime: Infinity })
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

/** An edit of the title or the text (autosave, D-203), or a pin. */
export function useSaveNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ note, change }: { note: NoteItem; change: NoteChange }) => saveNote(note, change),
    onSuccess: (saved) => editNotes(queryClient, (notes) => notes.map((entry) => (entry.id === saved.id ? saved : entry))),
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteNote,
    onSuccess: (_, note) => editNotes(queryClient, (notes) => notes.filter((entry) => entry.id !== note.id)),
  })
}
