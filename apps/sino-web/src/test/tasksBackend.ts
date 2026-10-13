import { http, HttpResponse } from 'msw'
import type { TaskItem } from '@/features/tasks/tasks.types'
import { API_PROVIDERS } from './fixtures/accountsApi'
import { API_TASKS, task } from './fixtures/tasksApi'
import { server } from './msw/server'

const FAILED = { title: 'Internal Server Error', status: 500, code: 'INTERNAL_ERROR' }
const INVALID_RECURRENCE = { title: 'Unprocessable Content', status: 422, code: 'INVALID_RECURRENCE', detail: 'The weekdays of the repeat rule do not include the weekday of its first date.' }
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

/**
 * The F16 task API (BE-72) over the tasks of `API_TASKS` held in memory, through MSW. `refuse` makes every change
 * fail with a 500; `refuseRule` answers every schedule with 422 INVALID_RECURRENCE. Each call is recorded.
 */
export function tasksBackend({ now = new Date('2026-10-02T07:05:00Z'), refuse = false, refuseRule = false }: { now?: Date; refuse?: boolean; refuseRule?: boolean } = {}) {
  let tasks: TaskItem[] = API_TASKS.map((item) => ({ ...item }))
  const added: unknown[] = []
  const patched: [string, unknown][] = []
  const scheduled: [string, unknown][] = []
  const deleted: string[] = []
  const replace = (changed: TaskItem) => {
    tasks = tasks.map((item) => (item.id === changed.id ? changed : item))
    return changed
  }
  const find = (id: unknown) => tasks.find((item) => item.id === id)
  server.use(
    http.get('/api/tasks', () => HttpResponse.json({ generatedAt: now.toISOString(), tasks })),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.post('/api/tasks', async ({ request }) => {
      const body = (await request.json()) as { title: string }
      added.push(body)
      if (refuse) {
        return problem(FAILED, 500)
      }
      const created = task({ id: `task-new-${added.length}`, title: body.title.trim(), createdAt: now.toISOString() })
      tasks = [...tasks, created]
      return HttpResponse.json(created, { status: 201 })
    }),
    http.post('/api/tasks/:id/complete', ({ params }) => {
      const current = find(params.id)
      if (refuse || !current) {
        return problem(FAILED, 500)
      }
      const done = replace({ ...current, status: 'DONE', completedAt: now.toISOString() })
      // The rent repeats on the 2nd of each month.
      const next = current.id === 'task-rent' ? task({ ...current, id: 'task-rent-11', dueAt: '2026-11-02T10:00:00Z', createdAt: now.toISOString() }) : null
      if (next) {
        tasks = [...tasks, next]
      }
      return HttpResponse.json({ task: done, next })
    }),
    http.post('/api/tasks/:id/reopen', ({ params }) => {
      const current = find(params.id)
      return refuse || !current ? problem(FAILED, 500) : HttpResponse.json(replace({ ...current, status: 'OPEN', completedAt: null }))
    }),
    http.patch('/api/tasks/:id', async ({ params, request }) => {
      const body = (await request.json()) as { title?: string | null; notes?: string | null }
      patched.push([String(params.id), body])
      const current = find(params.id)
      if (refuse || !current) {
        return problem(FAILED, 500)
      }
      const notes = body.notes == null ? current.notes : body.notes.trim() ? body.notes : null
      return HttpResponse.json(replace({ ...current, title: body.title?.trim() || current.title, notes }))
    }),
    http.put('/api/tasks/:id/schedule', async ({ params, request }) => {
      const body = (await request.json()) as Pick<TaskItem, 'dueAt' | 'dueDate' | 'recurrence'>
      scheduled.push([String(params.id), body])
      const current = find(params.id)
      if (refuseRule) {
        return problem(INVALID_RECURRENCE, 422)
      }
      if (refuse || !current) {
        return problem(FAILED, 500)
      }
      const recurrence = body.recurrence ?? null
      return HttpResponse.json(
        replace({ ...current, dueAt: body.dueAt ?? null, dueDate: body.dueDate ?? null, recurrence, seriesId: recurrence ? (current.seriesId ?? `series-${current.id}`) : current.seriesId }),
      )
    }),
    http.delete('/api/tasks/:id', ({ params }) => {
      deleted.push(String(params.id))
      if (refuse || !find(params.id)) {
        return problem(FAILED, 500)
      }
      tasks = tasks.filter((item) => item.id !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return { added, patched, scheduled, deleted, tasks: () => tasks }
}
