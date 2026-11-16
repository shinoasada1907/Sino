import { api } from '@/shared/api/client'
import type { Diagram, NoteChange, NoteItem, NotesData } from './notes.types'

/*
 * The requests of the Ghi chú screen, on the F15 API (BE-91). A note of the API has the shape of `NoteItem` already,
 * with its `version`; `anchor` and `quote` are null and `linked` is empty until notes are tied to messages (D-177). A
 * save carries the version the editor read, and the server refuses an older one with 409 (D-172).
 */

const path = (note: NoteItem) => `/api/notes/${encodeURIComponent(note.id)}`

/** `GET /api/notes`: every note, whole, the newest edit first. */
export async function fetchNotes(): Promise<NotesData> {
  return api.get<NotesData>('/api/notes')
}

/**
 * `POST /api/notes` with `{ kind: 'TEXT', title, body }`, or `{ kind: 'DIAGRAM', title, diagram }` for a diagram, which
 * has no body (D-179): a standalone note. An empty title is none.
 */
export async function createNote({ title, body, diagram }: { title: string; body: string; diagram?: Diagram }): Promise<NoteItem> {
  return api.post<NoteItem>('/api/notes', diagram ? { kind: 'DIAGRAM', title, diagram } : { kind: 'TEXT', title, body })
}

/**
 * `PATCH /api/notes/{id}` over `note.version`, with only what changed (a field left out stays on the server; an empty
 * title removes the title; a diagram replaces the whole diagram). The answer is the note with its new version.
 */
export async function saveNote(note: NoteItem, { title, body, pinned, diagram }: NoteChange): Promise<NoteItem> {
  return api.patch<NoteItem>(path(note), { version: note.version, title, body, pinned, diagram })
}

/** `DELETE /api/notes/{id}`: no version needed (D-176). */
export async function deleteNote(note: NoteItem): Promise<void> {
  return api.delete<void>(path(note))
}
