import { vi } from 'vitest'
import type * as NotesApi from '@/features/notes/notes.api'
import { createNotesSample } from '@/features/notes/notes.sample'
import type { Diagram, NoteChange, NoteItem } from '@/features/notes/notes.types'

/**
 * For `vi.mock('./notes.api', …)` in the tests written on the canvas sample (NT-01…NT-03, DG-01…DG-04): every request
 * answered as the sample backend did before FE-90, each a `vi.fn` a test can watch or override. The tests of the real
 * API (`NotesOnApi.test.tsx`) answer through MSW instead.
 */
export function sampleNotesApi(api: typeof NotesApi): typeof NotesApi {
  return {
    ...api,
    fetchNotes: vi.fn(async () => createNotesSample(new Date())),
    createNote: vi.fn(async ({ title, body, diagram }: { title: string; body: string; diagram?: Diagram }): Promise<NoteItem> => {
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
        version: 0,
        anchor: null,
        quote: null,
        linked: [],
      }
    }),
    // An edit of the title, the text or the diagram is the newest edit; a pin is not.
    saveNote: vi.fn(async (note: NoteItem, { title, body, pinned, diagram }: NoteChange): Promise<NoteItem> => {
      const edited = title !== undefined || body !== undefined || diagram !== undefined
      return {
        ...note,
        ...(title !== undefined ? { title: title.trim() || null } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(diagram !== undefined ? { diagram } : {}),
        ...(pinned !== undefined ? { pinned } : {}),
        updatedAt: edited ? new Date().toISOString() : note.updatedAt,
        version: note.version + 1,
      }
    }),
    deleteNote: vi.fn(async (): Promise<void> => undefined),
  }
}
