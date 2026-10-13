import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ProviderInfo } from '@/shared/domain'
import { addTask, completeTask, deleteTask, fetchTasks, reopenTask, saveTaskNotes, scheduleTask, updateTask } from './tasks.api'
import type { CompletedTask, TaskItem, TasksData } from './tasks.types'

export const TASKS_QUERY_KEY = ['tasks'] as const

// The prefix of every range the Lịch screen holds (`calendarKey`): it shows tasks that have a due.
const CALENDAR_QUERY_PREFIX = ['calendar'] as const

export interface TasksQuery {
  tasks: TaskItem[] | undefined
  providers: ProviderInfo[]
  /** When the list arrived (milliseconds since the epoch, 0 before any data). */
  receivedAt: number
  /** Why the last load failed; the page shows it only while there is no list. */
  error: Error | null
  failedAt: number
  retry: () => void
}

export function useTasks(): TasksQuery {
  const { data, dataUpdatedAt, error, errorUpdatedAt, refetch } = useQuery({ queryKey: TASKS_QUERY_KEY, queryFn: fetchTasks, staleTime: Infinity })
  return { tasks: data?.tasks, providers: data?.providers ?? [], receivedAt: dataUpdatedAt, error, failedAt: errorUpdatedAt, retry: () => void refetch() }
}

/** One task, from the list, so a change shows in its row and its detail at once. `notFound` once the list has no such id. */
export function useTask(taskId: string | undefined): { task: TaskItem | undefined; notFound: boolean } {
  const { tasks } = useTasks()
  const task = taskId === undefined ? undefined : tasks?.find((item) => item.id === taskId)
  return { task, notFound: taskId !== undefined && tasks !== undefined && task === undefined }
}

// The navigation counts the due tasks from this list (D-83, `AppShell`), so it follows every change made here.
function setTasks(queryClient: QueryClient, change: (tasks: TaskItem[]) => TaskItem[]) {
  queryClient.setQueryData<TasksData>(TASKS_QUERY_KEY, (current) => current && { ...current, tasks: change(current.tasks) })
}

function restore(queryClient: QueryClient, saved: TasksData | undefined) {
  if (saved) {
    queryClient.setQueryData(TASKS_QUERY_KEY, saved)
  }
}

// Whatever the outcome: a refused change may still have been made by another tab.
function refreshCalendar(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: CALENDAR_QUERY_PREFIX })
}

/** Adds a task by its title; it shows under "Không có hạn". */
export function useAddTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: addTask,
    onSuccess: (task) => setTasks(queryClient, (tasks) => [...tasks, task]),
    onSettled: () => refreshCalendar(queryClient),
  })
}

// The same occurrence is not added twice when a task is done, reopened and done again.
const sameOccurrence = (a: TaskItem, b: TaskItem) => a.seriesId === b.seriesId && a.status === 'OPEN' && a.dueAt === b.dueAt && a.dueDate === b.dueDate

/**
 * Done or reopened, at once; the server's answer then replaces the guess, with the next occurrence of a repeating task
 * (D-84). A failure puts the list back.
 */
export function useToggleTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (task: TaskItem): Promise<CompletedTask> =>
      task.status === 'OPEN' ? completeTask(task) : { task: await reopenTask(task), next: null },
    onMutate: (task) => {
      const saved = queryClient.getQueryData<TasksData>(TASKS_QUERY_KEY)
      const done = task.status === 'OPEN'
      setTasks(queryClient, (tasks) =>
        tasks.map((item) =>
          item.id === task.id ? { ...item, status: done ? 'DONE' : 'OPEN', completedAt: done ? new Date().toISOString() : null } : item,
        ),
      )
      return { saved }
    },
    onSuccess: ({ task, next }) =>
      setTasks(queryClient, (tasks) => {
        const updated = tasks.map((item) => (item.id === task.id ? task : item))
        return next && !updated.some((item) => sameOccurrence(item, next)) ? [...updated, next] : updated
      }),
    onError: (_error, _task, context) => restore(queryClient, context?.saved),
    onSettled: () => refreshCalendar(queryClient),
  })
}

export interface TaskChanges {
  fields?: { title: string; notes: string }
  schedule?: Pick<TaskItem, 'dueAt' | 'dueDate' | 'recurrence'>
}

/**
 * Saves the form of a task: the due and the rule first (the change the server is likeliest to refuse, before anything
 * else is saved), then the title and the notes. Not guessed ahead: the form waits for the server's answer, and each
 * answer replaces the task in the list as it comes.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient()
  const replace = (task: TaskItem) => setTasks(queryClient, (tasks) => tasks.map((item) => (item.id === task.id ? task : item)))
  return useMutation({
    mutationFn: async ({ task, changes }: { task: TaskItem; changes: TaskChanges }) => {
      let saved = task
      if (changes.schedule) {
        saved = await scheduleTask(saved, changes.schedule)
        replace(saved)
      }
      if (changes.fields) {
        saved = await updateTask(saved, changes.fields)
        replace(saved)
      }
      return saved
    },
    onSettled: () => refreshCalendar(queryClient),
  })
}

/** Deletes a task once the server has; it leaves the list then. */
export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteTask,
    onSuccess: (_nothing, task) => setTasks(queryClient, (tasks) => tasks.filter((item) => item.id !== task.id)),
    onSettled: () => refreshCalendar(queryClient),
  })
}

/** Saves the notes of a task (when the box loses focus). */
export function useSaveTaskNotes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ task, notes }: { task: TaskItem; notes: string }) => saveTaskNotes(task, notes),
    onMutate: ({ task, notes }) => {
      const saved = queryClient.getQueryData<TasksData>(TASKS_QUERY_KEY)
      setTasks(queryClient, (tasks) => tasks.map((item) => (item.id === task.id ? { ...item, notes } : item)))
      return { saved }
    },
    onSuccess: (task) => setTasks(queryClient, (tasks) => tasks.map((item) => (item.id === task.id ? task : item))),
    onError: (_error, _variables, context) => restore(queryClient, context?.saved),
    onSettled: () => refreshCalendar(queryClient),
  })
}
