import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/problem'
import { API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_WEEK, storedEvent } from '@/test/fixtures/calendarApi'
import { server } from '@/test/msw/server'
import { createEvent, deleteEvent, fetchCalendar, fetchEvent, updateEvent } from './calendar.api'

describe('the Lịch requests on the F17 API (BE-73, BE-74)', () => {
  it('asks for the range and adds the names of the providers', async () => {
    let query: URLSearchParams | undefined
    server.use(
      http.get('/api/calendar', ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json(API_WEEK)
      }),
      http.get('/api/providers', () => HttpResponse.json([{ ...API_PROVIDERS[0], capabilities: ['READ_MESSAGES'] }])),
    )

    const data = await fetchCalendar({ from: '2026-09-28', to: '2026-10-05' })

    expect(query?.get('from')).toBe('2026-09-28')
    expect(query?.get('to')).toBe('2026-10-05')
    expect(data).toEqual({ ...API_WEEK, providers: [{ type: 'gmail', displayName: 'Gmail', kind: 'EMAIL' }] })
  })

  it('fails with the problem of the server', async () => {
    server.use(
      http.get('/api/calendar', () =>
        HttpResponse.json({ title: 'Bad Request', status: 400, code: 'VALIDATION_FAILED' }, { status: 400, headers: { 'Content-Type': 'application/problem+json' } }),
      ),
      http.get('/api/providers', () => HttpResponse.json([])),
    )

    await expect(fetchCalendar({ from: '2026-09-28', to: '2026-09-28' })).rejects.toBeInstanceOf(ApiError)
  })

  it('reads, creates, replaces and deletes an appointment through /api/events', async () => {
    const sample = storedEvent({ id: 'event-team', title: 'Họp nhóm', startsAt: '2026-10-08T03:00:00Z', endsAt: '2026-10-08T04:00:00Z' })
    let createdBody: unknown
    let updatedBody: unknown
    let deletedId: string | undefined

    server.use(
      http.get('/api/events/:id', ({ params }) => HttpResponse.json({ ...sample, id: String(params.id) })),
      http.post('/api/events', async ({ request }) => {
        createdBody = await request.json()
        return HttpResponse.json(sample, { status: 201 })
      }),
      http.put('/api/events/:id', async ({ request }) => {
        updatedBody = await request.json()
        return HttpResponse.json({ ...sample, title: 'Họp nhóm chiều' })
      }),
      http.delete('/api/events/:id', ({ params }) => {
        deletedId = String(params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    expect(await fetchEvent('event-team')).toEqual(sample)

    const body = {
      title: 'Họp nhóm',
      startsAt: '2026-10-08T03:00:00Z',
      endsAt: '2026-10-08T04:00:00Z',
      startDate: null,
      endDate: null,
      location: null,
      notes: null,
      recurrence: null,
    }
    expect(await createEvent(body)).toEqual(sample)
    expect(createdBody).toEqual(body)

    expect((await updateEvent('event-team', { ...body, title: 'Họp nhóm chiều' })).title).toBe('Họp nhóm chiều')
    expect(updatedBody).toEqual({ ...body, title: 'Họp nhóm chiều' })

    await deleteEvent('event-team')
    expect(deletedId).toBe('event-team')
  })
})
