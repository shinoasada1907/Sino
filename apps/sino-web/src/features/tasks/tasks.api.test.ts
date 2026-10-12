import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_TASKS, task } from '@/test/fixtures/tasksApi'
import { server } from '@/test/msw/server'
import { ApiError } from '@/shared/api/problem'
import { addTask, completeTask, deleteTask, fetchTasks, reopenTask, saveTaskNotes, scheduleTask, updateTask } from './tasks.api'

const RENT = API_TASKS[1]

describe('the Việc cần làm requests on the F16 API (BE-72)', () => {
  it('reads the tasks and the names of the providers', async () => {
    server.use(
      http.get('/api/tasks', () => HttpResponse.json({ generatedAt: '2026-10-02T07:05:00Z', tasks: API_TASKS })),
      http.get('/api/providers', () => HttpResponse.json([{ ...API_PROVIDERS[0], capabilities: ['READ_MESSAGES'] }])),
    )

    const data = await fetchTasks()

    expect(data.generatedAt).toBe('2026-10-02T07:05:00Z')
    expect(data.tasks).toEqual(API_TASKS)
    expect(data.providers).toEqual([{ type: 'gmail', displayName: 'Gmail' }])
  })

  it('adds a task by its title', async () => {
    let body: unknown
    server.use(
      http.post('/api/tasks', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(task({ id: 'task-new', title: 'Gọi thợ' }), { status: 201 })
      }),
    )

    expect((await addTask('Gọi thợ')).id).toBe('task-new')
    expect(body).toEqual({ title: 'Gọi thợ' })
  })

  it('completes a task and gets its next occurrence', async () => {
    const next = task({ id: 'task-rent-11', title: RENT.title, dueAt: '2026-11-02T10:00:00Z', seriesId: 'series-rent' })
    server.use(
      http.post('/api/tasks/task-rent/complete', () =>
        HttpResponse.json({ task: { ...RENT, status: 'DONE', completedAt: '2026-10-02T07:05:00Z' }, next }),
      ),
    )

    const done = await completeTask(RENT)

    expect(done.task.status).toBe('DONE')
    expect(done.next).toEqual(next)
  })

  it('opens a task again', async () => {
    server.use(http.post('/api/tasks/task-clinic/reopen', () => HttpResponse.json({ ...API_TASKS[4], status: 'OPEN', completedAt: null })))

    expect((await reopenTask(API_TASKS[4])).status).toBe('OPEN')
  })

  it('saves the notes as they are; the server makes empty notes none', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch('/api/tasks/task-print', async ({ request }) => {
        const body = (await request.json()) as { notes: string }
        bodies.push(body)
        return HttpResponse.json({ ...API_TASKS[3], notes: body.notes.trim() ? body.notes : null })
      }),
    )

    expect((await saveTaskNotes(API_TASKS[3], 'Hỏi cả giá giấy')).notes).toBe('Hỏi cả giá giấy')
    expect((await saveTaskNotes(API_TASKS[3], '')).notes).toBeNull()
    expect(bodies).toEqual([{ notes: 'Hỏi cả giá giấy' }, { notes: '' }])
  })

  it('reports the problem of a refused change', async () => {
    server.use(
      http.post('/api/tasks/task-rent/complete', () =>
        HttpResponse.json({ title: 'Not found', status: 404, code: 'TASK_NOT_FOUND' }, { status: 404, headers: { 'Content-Type': 'application/problem+json' } }),
      ),
    )

    await expect(completeTask(RENT)).rejects.toEqual(expect.objectContaining<Partial<ApiError>>({ status: 404, code: 'TASK_NOT_FOUND' }))
  })

  it('renames a task with its notes', async () => {
    let body: unknown
    server.use(
      http.patch('/api/tasks/task-print', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...API_TASKS[3], title: 'Hỏi Hoàng giá in', notes: 'Hai mặt' })
      }),
    )

    expect((await updateTask(API_TASKS[3], { title: 'Hỏi Hoàng giá in', notes: 'Hai mặt' })).title).toBe('Hỏi Hoàng giá in')
    expect(body).toEqual({ title: 'Hỏi Hoàng giá in', notes: 'Hai mặt' })
  })

  it('puts the due and the rule together', async () => {
    const schedule = {
      dueAt: null,
      dueDate: '2026-10-09',
      recurrence: { freq: 'WEEKLY' as const, interval: 1, byWeekdays: ['FRIDAY' as const], byMonthDay: null, untilDate: null, count: null },
    }
    let body: unknown
    server.use(
      http.put('/api/tasks/task-print/schedule', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...API_TASKS[3], ...schedule, seriesId: 'series-print' })
      }),
    )

    expect((await scheduleTask(API_TASKS[3], schedule)).seriesId).toBe('series-print')
    expect(body).toEqual(schedule)
  })

  it('deletes a task', async () => {
    let deleted = false
    server.use(
      http.delete('/api/tasks/task-print', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(deleteTask(API_TASKS[3])).resolves.toBeUndefined()
    expect(deleted).toBe(true)
  })
})
