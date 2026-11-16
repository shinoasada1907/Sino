import { delay, http, HttpResponse } from 'msw'
import type { Diagram, NoteItem } from '@/features/notes/notes.types'
import { API_NOTES, diagramNote, note } from './fixtures/notesApi'
import { server } from './msw/server'

const FAILED = { title: 'Internal Server Error', status: 500, code: 'INTERNAL_ERROR' }
const NOT_FOUND = { title: 'Not Found', status: 404, code: 'NOTE_NOT_FOUND', detail: 'Note not found.' }
const CONFLICT = { title: 'Conflict', status: 409, code: 'CONCURRENT_MODIFICATION' }
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

type Change = { version?: number; title?: string | null; body?: string | null; pinned?: boolean | null; diagram?: Diagram | null }

/**
 * The F15 note API (BE-91) over the notes of `API_NOTES` held in memory, through MSW, with the rules of the real one:
 * a change carries the `version` it read and an older one is a 409 that writes nothing (D-172); a change that changes
 * nothing keeps the version; a pin keeps the time of the edit. Each call is recorded.
 *
 * What a test can do to the server meanwhile, as another tab would: `editElsewhere`, `removeElsewhere`, `fail(n)` makes
 * the next n changes answer 500, `setDown(true)` makes every change fail as a lost network does, `slowSaves(ms)` makes
 * a save slow.
 */
export function notesBackend({ now = new Date('2026-10-02T07:05:00Z') }: { now?: Date } = {}) {
  let items: NoteItem[] = API_NOTES.map((item) => ({ ...item }))
  const created: unknown[] = []
  const patched: [string, Change][] = []
  const deleted: string[] = []
  let failures = 0
  let down = false
  let slow = 0
  const find = (id: unknown) => items.find((item) => item.id === id)
  const replace = (changed: NoteItem) => {
    items = items.map((item) => (item.id === changed.id ? changed : item))
    return changed
  }
  // What the server does with a change, in one place for a request and for `editElsewhere`.
  const apply = (current: NoteItem, change: Change, at: Date): NoteItem => {
    const title = change.title === undefined || change.title === null ? current.title : change.title.trim() || null
    const body = change.body ?? current.body
    const diagram = change.diagram ?? current.diagram
    const pinned = change.pinned ?? current.pinned
    const edited = title !== current.title || body !== current.body || JSON.stringify(diagram) !== JSON.stringify(current.diagram)
    if (!edited && pinned === current.pinned) {
      return current
    }
    return { ...current, title, body, diagram, pinned, updatedAt: edited ? at.toISOString() : current.updatedAt, version: current.version + 1 }
  }
  const refused = () => {
    if (down) {
      return HttpResponse.error()
    }
    if (failures > 0) {
      failures -= 1
      return problem(FAILED, 500)
    }
    return null
  }
  server.use(
    http.get('/api/notes', () => HttpResponse.json({ generatedAt: now.toISOString(), notes: [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) })),
    http.post('/api/notes', async ({ request }) => {
      const body = (await request.json()) as { kind?: string; title?: string; body?: string; diagram?: Diagram }
      created.push(body)
      const failed = refused()
      if (failed) {
        return failed
      }
      const fields = { id: `note-new-${created.length}`, title: body.title?.trim() || null, createdAt: now.toISOString(), updatedAt: now.toISOString() }
      const made = body.kind === 'DIAGRAM' ? diagramNote({ ...fields, diagram: body.diagram! }) : note({ ...fields, body: body.body ?? '' })
      items = [...items, made]
      return HttpResponse.json(made, { status: 201 })
    }),
    http.patch('/api/notes/:id', async ({ params, request }) => {
      const change = (await request.json()) as Change
      patched.push([String(params.id), change])
      if (slow > 0) {
        await delay(slow)
      }
      const failed = refused()
      if (failed) {
        return failed
      }
      const current = find(params.id)
      if (!current) {
        return problem(NOT_FOUND, 404)
      }
      if (change.version !== current.version) {
        return problem(CONFLICT, 409)
      }
      return HttpResponse.json(replace(apply(current, change, now)))
    }),
    http.delete('/api/notes/:id', ({ params }) => {
      deleted.push(String(params.id))
      const failed = refused()
      if (failed) {
        return failed
      }
      if (!find(params.id)) {
        return problem(NOT_FOUND, 404)
      }
      items = items.filter((item) => item.id !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return {
    created,
    patched,
    deleted,
    notes: () => items,
    note: (id: string) => find(id),
    /** Another tab saves `change` over the current version: the version goes up. */
    editElsewhere: (id: string, change: Omit<Change, 'version'>, at = new Date(now.getTime() + 60_000)) => {
      replace(apply(find(id)!, change, at))
    },
    removeElsewhere: (id: string) => {
      items = items.filter((item) => item.id !== id)
    },
    fail: (count: number) => {
      failures = count
    },
    setDown: (value: boolean) => {
      down = value
    },
    /** Every save takes this many ms to answer, so that a second one can start before the first is done. */
    slowSaves: (ms: number) => {
      slow = ms
    },
  }
}
