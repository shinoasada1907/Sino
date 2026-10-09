import { createTasksSample, nextOccurrenceSample } from './tasks.sample'
import type { CompletedTask, TaskItem, TasksData } from './tasks.types'

/*
 * The requests of the Việc cần làm screen. They return sample data until the backend has F16 (D-42); connecting the API
 * means changing only the bodies below. The changes take the whole task because the sample needs it; the API needs
 * only its id.
 */

/** Later `GET /api/tasks`. */
export async function fetchTasks(): Promise<TasksData> {
  return createTasksSample(new Date())
}

/** Later `POST /api/tasks` with `{ title }`: a task without a due ("chọn hạn sau"). */
export async function addTask(title: string): Promise<TaskItem> {
  return {
    id: crypto.randomUUID(),
    title,
    notes: null,
    status: 'OPEN',
    dueAt: null,
    dueDate: null,
    reminder: null,
    recurrence: null,
    seriesId: null,
    source: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    related: null,
  }
}

/** Later `POST /api/tasks/{id}/complete`: done, a reminder that has not fired is cancelled, the next occurrence made. */
export async function completeTask(task: TaskItem): Promise<CompletedTask> {
  const now = new Date()
  return {
    task: { ...task, status: 'DONE', completedAt: now.toISOString(), reminder: task.reminder?.state === 'FIRED' ? task.reminder : null },
    next: nextOccurrenceSample(task, now),
  }
}

/** Later `POST /api/tasks/{id}/reopen`. */
export async function reopenTask(task: TaskItem): Promise<TaskItem> {
  return { ...task, status: 'OPEN', completedAt: null }
}

/** Later `PATCH /api/tasks/{id}` with `{ notes }`; empty notes are none. */
export async function saveTaskNotes(task: TaskItem, notes: string): Promise<TaskItem> {
  return { ...task, notes: notes.trim() ? notes : null }
}
