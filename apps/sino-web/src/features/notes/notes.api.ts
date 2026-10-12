import { createNotesSample } from './notes.sample'
import type { NoteChange, NoteItem, NotesData } from './notes.types'

/*
 * The requests of the Ghi chú screen. They return sample data until the backend has F15 (D-42); connecting the API means
 * changing only the bodies below. The changes take the whole note because the sample needs it; the API needs its id.
 */

/** Later `GET /api/notes`. */
export async function fetchNotes(): Promise<NotesData> {
  return createNotesSample(new Date())
}

/** Later `POST /api/notes` with `{ title, body }`: a standalone note (D-203). */
export async function createNote({ title, body }: { title: string; body: string }): Promise<NoteItem> {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), title: title.trim() || null, body, pinned: false, createdAt: now, updatedAt: now, anchor: null, quote: null, linked: [] }
}

/** Later `PATCH /api/notes/{id}`: an edit of the title or the text is the newest edit; a pin is not an edit. */
export async function saveNote(note: NoteItem, { title, body, pinned }: NoteChange): Promise<NoteItem> {
  const edited = title !== undefined || body !== undefined
  return {
    ...note,
    ...(title !== undefined ? { title: title.trim() || null } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(pinned !== undefined ? { pinned } : {}),
    updatedAt: edited ? new Date().toISOString() : note.updatedAt,
  }
}

/** Later `DELETE /api/notes/{id}`. */
export async function deleteNote(note: NoteItem): Promise<void> {
  void note
}
