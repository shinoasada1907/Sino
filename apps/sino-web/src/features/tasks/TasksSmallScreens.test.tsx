import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp, shellPart } from '@/test/renderApp'
import { fetchTasks } from './tasks.api'
import { createTasksSample } from './tasks.sample'
import type { TasksData } from './tasks.types'

vi.mock('./tasks.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./tasks.api')>()
  return { ...api, fetchTasks: vi.fn(api.fetchTasks) }
})

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string, tasks: TasksData | null = createTasksSample(NOW)) {
  return renderApp(path, { shell: createShellSample(NOW), tasks })
}

const list = () => within(screen.getByRole('region', { name: 'Danh sách việc' }))
const mobileHeader = () => within(document.querySelector<HTMLElement>('[data-slot="tasks-mobile-header"]')!)

describe('Việc cần làm on a phone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heads the list with its own header, as MobileTasks does, under which the shell shows no top bar', () => {
    open('/tasks')

    expect(mobileHeader().getByRole('heading', { level: 1, name: 'Việc cần làm' })).toBeInTheDocument()
    expect(mobileHeader().getByText('8 đang mở')).toBeInTheDocument()
    expect(shellPart('topbar')).toHaveClass('max-md:hidden')
  })

  it('filters from the "Lọc" menu', async () => {
    const { router } = open('/tasks')
    const user = userEvent.setup()

    await user.click(mobileHeader().getByRole('button', { name: 'Lọc' }))
    const menu = within(await screen.findByRole('menu'))
    expect(menu.getByRole('menuitemradio', { name: 'Tất cả' })).toHaveAttribute('aria-checked', 'true')
    await user.click(menu.getByRole('menuitemradio', { name: 'Từ tin nhắn' }))

    expect(router.state.location.search).toBe('?filter=messages')
    expect(mobileHeader().getByRole('button', { name: 'Lọc: Từ tin nhắn' })).toBeInTheDocument()
  })

  it('opens a task on a page of its own, with a way back to the list and its filter, and no tab bar', async () => {
    const { router } = open('/tasks/task-contract?filter=messages')

    const detail = within(screen.getByRole('complementary', { name: 'Chi tiết việc' }))
    expect(detail.getByRole('heading', { level: 1, name: 'Chi tiết việc' })).toBeInTheDocument()
    expect(detail.getByRole('link', { name: 'Quay lại Việc cần làm' })).toHaveAttribute('href', '/tasks?filter=messages')
    expect(detail.getByRole('heading', { level: 2, name: 'Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="tabbar"]')).toBeNull()
    expect(router.state.location.pathname).toBe('/tasks/task-contract')
  })
})

describe('states of the Việc cần làm screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the shape of the list while it loads', async () => {
    vi.mocked(fetchTasks).mockReturnValueOnce(new Promise(() => {}))
    open('/tasks', null)

    expect(await screen.findByRole('status', { name: 'Đang tải việc cần làm' })).toBeInTheDocument()
  })

  it('says so when the list cannot load, and loads it on "Thử lại"', async () => {
    vi.mocked(fetchTasks).mockRejectedValueOnce(new Error('offline'))
    open('/tasks', null)
    const user = userEvent.setup()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'Không tải được việc cần làm' })).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await list().findByRole('link', { name: /Hợp đồng thuê/ })).toBeInTheDocument()
  })

  it('says there is no task yet, and still adds one', async () => {
    open('/tasks', { ...createTasksSample(NOW), tasks: [] })
    const user = userEvent.setup()

    expect(list().getByText('Chưa có việc nào.')).toBeInTheDocument()
    await user.type(list().getByRole('textbox', { name: 'Thêm việc mới' }), 'Gọi điện cho thợ sửa máy lạnh{Enter}')

    expect(list().queryByText('Chưa có việc nào.')).toBeNull()
    expect(list().getByRole('region', { name: 'KHÔNG CÓ HẠN' })).toHaveTextContent('Gọi điện cho thợ sửa máy lạnh')
  })

  it('says when no task matches the filter', () => {
    const tasks = createTasksSample(NOW).tasks.filter((task) => task.recurrence === null)
    open('/tasks?filter=repeat', { ...createTasksSample(NOW), tasks })

    expect(list().getByText('Không có việc nào khớp bộ lọc này.')).toBeInTheDocument()
  })
})
