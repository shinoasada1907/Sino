import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calendarKey } from '@/features/calendar/useCalendar'
import { navCountsOf } from './format'
import { completeTask } from './tasks.api'
import { createTasksSample } from './tasks.sample'
import type { TaskItem, TasksData } from './tasks.types'
import { TASKS_QUERY_KEY, useAddTask, useSaveTaskNotes, useTask, useToggleTask } from './useTasks'

vi.mock('./tasks.api', async (importOriginal) => (await import('@/test/tasksSampleApi')).sampleTasksApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData(TASKS_QUERY_KEY, createTasksSample(NOW))
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const tasks = () => queryClient.getQueryData<TasksData>(TASKS_QUERY_KEY)!.tasks
  const find = (id: string) => tasks().find((task) => task.id === id)!
  // The shell counts the navigation from the list (D-83), so the counts follow every change of the list.
  const navCounts = () => navCountsOf(tasks(), NOW)
  return { queryClient, wrapper, tasks, find, navCounts }
}

describe('the tasks hooks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('finds one task in the list, or says it is not there', () => {
    const { wrapper } = setup()
    expect(renderHook(() => useTask('task-contract'), { wrapper }).result.current).toMatchObject({ task: { title: 'Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2' }, notFound: false })
    expect(renderHook(() => useTask('task-nope'), { wrapper }).result.current).toEqual({ task: undefined, notFound: true })
  })

  it('does not call a task missing before the list has arrived', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    expect(renderHook(() => useTask('task-nope'), { wrapper }).result.current).toEqual({ task: undefined, notFound: false })
  })

  it('adds a task without a due', async () => {
    const { wrapper, tasks, navCounts } = setup()
    const { result } = renderHook(() => useAddTask(), { wrapper })

    await act(() => result.current.mutateAsync('Gọi điện cho thợ sửa máy lạnh'))

    expect(tasks().at(-1)).toMatchObject({ title: 'Gọi điện cho thợ sửa máy lạnh', status: 'OPEN', dueAt: null, dueDate: null, createdAt: NOW.toISOString() })
    expect(navCounts()).toMatchObject({ tasksDue: 3, tasksOverdue: 1 })
  })

  it('completes a repeating task: it is done, its next occurrence appears, and the navigation counts one due task less', async () => {
    const { wrapper, tasks, find, navCounts } = setup()
    const { result } = renderHook(() => useToggleTask(), { wrapper })

    await act(() => result.current.mutateAsync(find('task-rent')))

    expect(find('task-rent')).toMatchObject({ status: 'DONE', completedAt: NOW.toISOString() })
    expect(tasks().filter((task) => task.seriesId === 'series-rent' && task.status === 'OPEN').map((task) => task.dueAt)).toEqual(['2026-11-02T10:00:00.000Z'])
    expect(navCounts()).toMatchObject({ tasksDue: 2, tasksOverdue: 1 })
  })

  it('makes the next occurrence once, however often the task is done and reopened', async () => {
    const { wrapper, tasks, find } = setup()
    const { result } = renderHook(() => useToggleTask(), { wrapper })

    await act(() => result.current.mutateAsync(find('task-rent')))
    await act(() => result.current.mutateAsync(find('task-rent')))
    expect(find('task-rent').status).toBe('OPEN')
    await act(() => result.current.mutateAsync(find('task-rent')))

    expect(tasks().filter((task) => task.seriesId === 'series-rent')).toHaveLength(2)
  })

  it('completing the late task clears the late mark; reopening a task due this morning makes it late', async () => {
    const { wrapper, find, navCounts } = setup()
    const { result } = renderHook(() => useToggleTask(), { wrapper })

    await act(() => result.current.mutateAsync(find('task-bill')))
    expect(navCounts()).toMatchObject({ tasksDue: 2, tasksOverdue: 0 })

    await act(() => result.current.mutateAsync(find('task-clinic')))
    expect(find('task-clinic')).toMatchObject({ status: 'OPEN', completedAt: null })
    expect(navCounts()).toMatchObject({ tasksDue: 3, tasksOverdue: 1 })
  })

  it('cancels a reminder that has not fired when the task is done', async () => {
    const { wrapper, find } = setup()
    const { result } = renderHook(() => useToggleTask(), { wrapper })

    await act(() => result.current.mutateAsync(find('task-cake')))

    expect(find('task-cake').reminder).toBeNull()
  })

  it('shows the change at once, and puts it back when it fails', async () => {
    let fail: (error: Error) => void = () => {}
    vi.mocked(completeTask).mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)))
    const { wrapper, find, navCounts } = setup()
    const { result } = renderHook(() => useToggleTask(), { wrapper })

    act(() => result.current.mutate(find('task-bill')))
    await waitFor(() => expect(find('task-bill').status).toBe('DONE'))
    expect(navCounts()).toMatchObject({ tasksOverdue: 0 })

    act(() => fail(new Error('offline')))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(find('task-bill')).toMatchObject({ status: 'OPEN', completedAt: null })
    expect(navCounts()).toMatchObject({ tasksDue: 3, tasksOverdue: 1 })
  })

  it('makes the calendar read its ranges again after a task changes', async () => {
    const { queryClient, wrapper, find } = setup()
    const week = calendarKey({ from: '2026-09-28', to: '2026-10-05' })
    queryClient.setQueryData(week, { tasks: [] })
    const { result } = renderHook(() => ({ toggle: useToggleTask(), add: useAddTask(), notes: useSaveTaskNotes() }), { wrapper })

    await act(() => result.current.toggle.mutateAsync(find('task-rent')))
    expect(queryClient.getQueryState(week)?.isInvalidated).toBe(true)

    queryClient.setQueryData(week, { tasks: [] })
    await act(() => result.current.add.mutateAsync('Gọi thợ'))
    expect(queryClient.getQueryState(week)?.isInvalidated).toBe(true)

    queryClient.setQueryData(week, { tasks: [] })
    await act(() => result.current.notes.mutateAsync({ task: find('task-print'), notes: 'Hỏi giá' }))
    expect(queryClient.getQueryState(week)?.isInvalidated).toBe(true)
  })

  it('saves the notes of a task', async () => {
    const { wrapper, find } = setup()
    const { result } = renderHook(() => useSaveTaskNotes(), { wrapper })
    const task: TaskItem = find('task-print')

    await act(() => result.current.mutateAsync({ task, notes: 'Hỏi cả giá in 2 mặt.' }))

    expect(find('task-print').notes).toBe('Hỏi cả giá in 2 mặt.')

    // Spaces only is no note.
    await act(() => result.current.mutateAsync({ task: find('task-print'), notes: '   ' }))
    expect(find('task-print').notes).toBeNull()
  })
})
