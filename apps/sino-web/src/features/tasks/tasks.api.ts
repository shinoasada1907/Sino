import { api } from '@/shared/api/client'
import { toProviderInfo, type ProviderEntry } from '@/shared/api/providers'
import type { Instant } from '@/shared/domain'
import type { CompletedTask, TaskItem, TasksData } from './tasks.types'

/*
 * The requests of the Việc cần làm screen, on the F16 API (BE-72). A task of the API has the shape of `TaskItem`
 * already; reminders, sources and related items are null until the backend has them (D-150). The changes take the
 * whole task, as the sample did; the API needs only its id.
 */

const path = (task: TaskItem, action = '') => `/api/tasks/${encodeURIComponent(task.id)}${action}`

/** `GET /api/tasks` (open tasks and those done in the last 7 days) and `GET /api/providers`. */
export async function fetchTasks(): Promise<TasksData> {
  const [list, providers] = await Promise.all([
    api.get<{ generatedAt: Instant; tasks: TaskItem[] }>('/api/tasks'),
    // The name shown next to the source of a task.
    api.get<ProviderEntry[]>('/api/providers'),
  ])
  return {
    generatedAt: list.generatedAt,
    providers: providers.map(toProviderInfo),
    tasks: list.tasks,
  }
}

/** `POST /api/tasks` with `{ title }`: a task without a due ("chọn hạn sau"). */
export async function addTask(title: string): Promise<TaskItem> {
  return api.post<TaskItem>('/api/tasks', { title })
}

/** `POST /api/tasks/{id}/complete`: done, and the next occurrence of a repeating task. */
export async function completeTask(task: TaskItem): Promise<CompletedTask> {
  return api.post<CompletedTask>(path(task, '/complete'))
}

/** `POST /api/tasks/{id}/reopen`. */
export async function reopenTask(task: TaskItem): Promise<TaskItem> {
  return api.post<TaskItem>(path(task, '/reopen'))
}

/** `PATCH /api/tasks/{id}` with `{ notes }`; the server makes empty notes none. */
export async function saveTaskNotes(task: TaskItem, notes: string): Promise<TaskItem> {
  return api.patch<TaskItem>(path(task), { notes })
}

/** `PATCH /api/tasks/{id}` with `{ title, notes }` (the form). */
export async function updateTask(task: TaskItem, fields: { title: string; notes: string }): Promise<TaskItem> {
  return api.patch<TaskItem>(path(task), fields)
}

/** `PUT /api/tasks/{id}/schedule`: the due and the repeat rule together; nulls take them away (D-153). */
export async function scheduleTask(task: TaskItem, schedule: Pick<TaskItem, 'dueAt' | 'dueDate' | 'recurrence'>): Promise<TaskItem> {
  return api.put<TaskItem>(path(task, '/schedule'), schedule)
}

/** `DELETE /api/tasks/{id}`: this task only; the done occurrences of its series stay. */
export async function deleteTask(task: TaskItem): Promise<void> {
  return api.delete<void>(path(task))
}
