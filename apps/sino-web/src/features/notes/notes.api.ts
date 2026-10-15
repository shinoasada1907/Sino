import { createNotesSample } from './notes.sample'
import type { Diagram, NoteChange, NoteItem, NotesData } from './notes.types'

/*
 * The requests of the Ghi chú screen. They return sample data until the backend has F15 (D-42); connecting the API means
 * changing only the bodies below. The changes take the whole note because the sample needs it; the API needs its id.
 */

/** Later `GET /api/notes`. */
export async function fetchNotes(): Promise<NotesData> {
  return createNotesSample(new Date())
}

/**
 * Later `POST /api/notes` with `{ kind, title, body }` (D-203), or `{ kind: 'DIAGRAM', title, diagram }` for a diagram
 * (fe-ui-diagram-notes, D-211): a standalone note.
 */
export async function createNote({ title, body, diagram }: { title: string; body: string; diagram?: Diagram }): Promise<NoteItem> {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    kind: diagram ? 'DIAGRAM' : 'TEXT',
    title: title.trim() || null,
    body: diagram ? '' : body,
    diagram: diagram ?? null,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    anchor: null,
    quote: null,
    linked: [],
  }
}

/** Later `PATCH /api/notes/{id}`: an edit of the title, the text or the diagram is the newest edit; a pin is not an edit. */
export async function saveNote(note: NoteItem, { title, body, pinned, diagram }: NoteChange): Promise<NoteItem> {
  const edited = title !== undefined || body !== undefined || diagram !== undefined
  return {
    ...note,
    ...(title !== undefined ? { title: title.trim() || null } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(diagram !== undefined ? { diagram } : {}),
    ...(pinned !== undefined ? { pinned } : {}),
    updatedAt: edited ? new Date().toISOString() : note.updatedAt,
  }
}

/** Later `DELETE /api/notes/{id}`. */
export async function deleteNote(note: NoteItem): Promise<void> {
  void note
}
