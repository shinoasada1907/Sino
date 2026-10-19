import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/problem'
import { API_NOTES, diagramNote, note } from '@/test/fixtures/notesApi'
import { server } from '@/test/msw/server'
import { createNote, deleteNote, fetchNotes, saveNote } from './notes.api'

const GRAN = API_NOTES[0]
const PLAN = API_NOTES[2]

describe('the Ghi chú requests on the F15 API (BE-91)', () => {
  it('reads every note of the owner', async () => {
    server.use(http.get('/api/notes', () => HttpResponse.json({ generatedAt: '2026-10-02T07:05:00Z', notes: API_NOTES })))

    const data = await fetchNotes()

    expect(data.generatedAt).toBe('2026-10-02T07:05:00Z')
    expect(data.notes).toEqual(API_NOTES)
  })

  it('creates a text note from its title and text', async () => {
    let body: unknown
    server.use(
      http.post('/api/notes', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(note({ id: 'note-new', body: 'Gọi lại', title: 'Việc' }), { status: 201 })
      }),
    )

    const created = await createNote({ title: 'Việc', body: 'Gọi lại' })

    expect(created.id).toBe('note-new')
    expect(body).toEqual({ kind: 'TEXT', title: 'Việc', body: 'Gọi lại' })
  })

  it('creates a diagram from its title and its whole diagram, without a body', async () => {
    let body: unknown
    server.use(
      http.post('/api/notes', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(diagramNote({ id: 'note-new', diagram: PLAN.diagram! }), { status: 201 })
      }),
    )

    const created = await createNote({ title: '', body: '', diagram: PLAN.diagram! })

    expect(created.kind).toBe('DIAGRAM')
    expect(body).toEqual({ kind: 'DIAGRAM', title: '', diagram: PLAN.diagram })
  })

  it('saves what changed over the version of the note, and nothing else', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch('/api/notes/note-gran', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ...GRAN, version: GRAN.version + 1 })
      }),
    )

    await saveNote(GRAN, { body: 'Thêm sữa.' })
    await saveNote(GRAN, { pinned: false })
    await saveNote(GRAN, { title: '' })

    // A field left out is not sent, so the server keeps it; an empty title is sent, to remove the title.
    expect(bodies).toEqual([{ version: 2, body: 'Thêm sữa.' }, { version: 2, pinned: false }, { version: 2, title: '' }])
  })

  it('saves a diagram as a whole', async () => {
    let body: unknown
    server.use(
      http.patch('/api/notes/note-plan', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...PLAN, version: PLAN.version + 1 })
      }),
    )

    await saveNote(PLAN, { diagram: PLAN.diagram! })

    expect(body).toEqual({ version: 4, diagram: PLAN.diagram })
  })

  it('deletes a note', async () => {
    let deleted: string | undefined
    server.use(
      http.delete('/api/notes/:id', ({ params }) => {
        deleted = String(params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(deleteNote(GRAN)).resolves.toBeUndefined()
    expect(deleted).toBe('note-gran')
  })

  it('tells a save over an older version from any other failure, by its status and code', async () => {
    server.use(
      http.patch('/api/notes/note-gran', () =>
        HttpResponse.json({ title: 'Conflict', status: 409, code: 'CONCURRENT_MODIFICATION' }, { status: 409, headers: { 'Content-Type': 'application/problem+json' } }),
      ),
      http.patch('/api/notes/note-trip', () =>
        HttpResponse.json({ title: 'Not Found', status: 404, code: 'NOTE_NOT_FOUND' }, { status: 404, headers: { 'Content-Type': 'application/problem+json' } }),
      ),
    )

    await expect(saveNote(GRAN, { body: 'x' })).rejects.toMatchObject({ status: 409, code: 'CONCURRENT_MODIFICATION' })
    await expect(saveNote(API_NOTES[1], { body: 'x' })).rejects.toMatchObject({ status: 404, code: 'NOTE_NOT_FOUND' })
    await expect(saveNote(GRAN, { body: 'x' })).rejects.toBeInstanceOf(ApiError)
  })
})
