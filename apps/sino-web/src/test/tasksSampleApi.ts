import { vi } from 'vitest'
import type * as TasksApi from '@/features/tasks/tasks.api'
import { createTasksSample, nextOccurrenceSample } from '@/features/tasks/tasks.sample'
import type { CompletedTask, TaskItem } from '@/features/tasks/tasks.types'

/**
 * For `vi.mock('./tasks.api', …)` in the tests written on the canvas sample (TK-01…TK-03): every request answered as
 * the sample backend did before FE-70, each a `vi.fn` a test can watch or override. The tests of the real API
 * (`TasksOnApi.test.tsx`) answer through MSW instead.
 */
export function sampleTasksApi(api: typeof TasksApi): typeof TasksApi {
  return {
    ...api,
    fetchTasks: vi.fn(async () => createTasksSample(new Date())),
    addTask: vi.fn(
      async (title: string): Promise<TaskItem> => ({
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
      }),
    ),
    // Done, a reminder that has not fired is cancelled, the next occurrence made.
    completeTask: vi.fn(async (task: TaskItem): Promise<CompletedTask> => {
      const now = new Date()
      return {
        task: { ...task, status: 'DONE', completedAt: now.toISOString(), reminder: task.reminder?.state === 'FIRED' ? task.reminder : null },
        next: nextOccurrenceSample(task, now),
      }
    }),
    reopenTask: vi.fn(async (task: TaskItem): Promise<TaskItem> => ({ ...task, status: 'OPEN', completedAt: null })),
    // Empty notes are none.
    saveTaskNotes: vi.fn(async (task: TaskItem, notes: string): Promise<TaskItem> => ({ ...task, notes: notes.trim() ? notes : null })),
  }
}
