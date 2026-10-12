import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_TASKS, task } from '@/test/fixtures/tasksApi'
import { server } from '@/test/msw/server'
import { renderApp, shellPart } from '@/test/renderApp'
import type { TaskItem } from './tasks.types'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const FAILED = { title: 'Internal Server Error', status: 500, code: 'INTERNAL_ERROR' }
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

/** The F16 task API over tasks held in memory, as BE-72 answers it; `refuse` makes every change fail. */
function backend({ refuse = false }: { refuse?: boolean } = {}) {
  let tasks: TaskItem[] = API_TASKS.map((item) => ({ ...item }))
  const added: unknown[] = []
  const patched: unknown[] = []
  const replace = (changed: TaskItem) => {
    tasks = tasks.map((item) => (item.id === changed.id ? changed : item))
    return changed
  }
  const find = (id: unknown) => tasks.find((item) => item.id === id)
  server.use(
    http.get('/api/tasks', () => HttpResponse.json({ generatedAt: NOW.toISOString(), tasks })),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.post('/api/tasks', async ({ request }) => {
      const body = (await request.json()) as { title: string }
      added.push(body)
      if (refuse) {
        return problem(FAILED, 500)
      }
      const created = task({ id: `task-new-${added.length}`, title: body.title.trim(), createdAt: NOW.toISOString() })
      tasks = [...tasks, created]
      return HttpResponse.json(created, { status: 201 })
    }),
    http.post('/api/tasks/:id/complete', ({ params }) => {
      const current = find(params.id)
      if (refuse || !current) {
        return problem(FAILED, 500)
      }
      const done = replace({ ...current, status: 'DONE', completedAt: NOW.toISOString() })
      // The rent repeats on the 2nd of each month.
      const next = current.id === 'task-rent' ? task({ ...current, id: 'task-rent-11', dueAt: '2026-11-02T10:00:00Z', createdAt: NOW.toISOString() }) : null
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
      const body = (await request.json()) as { notes: string }
      patched.push([params.id, body])
      const current = find(params.id)
      return refuse || !current ? problem(FAILED, 500) : HttpResponse.json(replace({ ...current, notes: body.notes.trim() ? body.notes : null }))
    }),
  )
  return { added, patched, tasks: () => tasks }
}

const open = (path: string) => renderApp(path, { tasks: null })
const list = () => within(screen.getByRole('region', { name: 'Danh sách việc' }))
const group = (name: string | RegExp) => within(list().getByRole('region', { name }))
const detail = () => within(screen.getByRole('complementary', { name: 'Chi tiết việc' }))
const titles = (name: string | RegExp) =>
  group(name)
    .queryAllByRole('link')
    .map((link) => link.querySelector('[data-slot="task-title"]')?.textContent)

describe('Việc cần làm on the F16 API (FE-70)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the tasks of the server in their groups', async () => {
    backend()
    open('/tasks')

    expect(await screen.findByRole('region', { name: 'QUÁ HẠN' })).toBeInTheDocument()
    expect(titles('QUÁ HẠN')).toEqual(['Gửi lại hóa đơn tháng 9 cho kế toán'])
    expect(titles(/HÔM NAY/)).toEqual(['Chuyển tiền nhà tháng 10'])
    expect(titles('SẮP TỚI')).toEqual(['Báo cáo tuần'])
    expect(titles('KHÔNG CÓ HẠN')).toEqual(['Hỏi Hoàng giá in bản thiết kế'])
    expect(titles('ĐÃ XONG')).toEqual(['Xác nhận lịch khám'])
  })

  it('counts the due tasks of the server on the navigation of every screen', async () => {
    backend()
    open('/overview')

    expect(await within(shellPart('sidebar')).findByRole('link', { name: 'Việc cần làm, 2 tới hạn' })).toBeInTheDocument()
  })

  it('adds a task on the server, and it is still there when the page is loaded again', async () => {
    const api = backend()
    const first = open('/tasks')
    const user = userEvent.setup()
    const box = await screen.findByRole('textbox', { name: 'Thêm việc mới' })

    await user.type(box, 'Gọi điện cho thợ sửa máy lạnh{Enter}')

    expect(await group('KHÔNG CÓ HẠN').findByText('Gọi điện cho thợ sửa máy lạnh')).toBeInTheDocument()
    expect(api.added).toEqual([{ title: 'Gọi điện cho thợ sửa máy lạnh' }])
    first.unmount()

    open('/tasks')
    expect(await screen.findByText('Gọi điện cho thợ sửa máy lạnh')).toBeInTheDocument()
  })

  it('gives the title back and says so when the server refuses a new task', async () => {
    const api = backend({ refuse: true })
    open('/tasks')
    const user = userEvent.setup()
    const box = await screen.findByRole('textbox', { name: 'Thêm việc mới' })

    await user.type(box, 'Gọi điện cho thợ sửa máy lạnh{Enter}')

    expect(await list().findByRole('alert')).toHaveTextContent('Không thêm được việc. Hãy thử lại.')
    expect(box).toHaveValue('Gọi điện cho thợ sửa máy lạnh')
    expect(titles('KHÔNG CÓ HẠN')).toEqual(['Hỏi Hoàng giá in bản thiết kế'])
    expect(api.added).toHaveLength(1)
  })

  it('completes a repeating task on the server and shows its next occurrence', async () => {
    backend()
    open('/tasks')
    const user = userEvent.setup()

    await screen.findByRole('region', { name: /HÔM NAY/ })
    await user.click(group(/HÔM NAY/).getByRole('checkbox', { name: 'Đánh dấu xong: Chuyển tiền nhà tháng 10' }))

    expect(await group('SẮP TỚI').findByRole('link', { name: /Chuyển tiền nhà/ })).toHaveTextContent('T2 02/11 · 17:00')
    expect(group('ĐÃ XONG').getByRole('link', { name: /Chuyển tiền nhà/ })).toBeInTheDocument()
    expect(within(shellPart('sidebar')).getByRole('link', { name: 'Việc cần làm, 1 tới hạn' })).toBeInTheDocument()
  })

  it('puts a task back and says so when the server refuses to mark it done', async () => {
    backend({ refuse: true })
    open('/tasks')
    const user = userEvent.setup()

    await screen.findByRole('region', { name: /HÔM NAY/ })
    await user.click(group(/HÔM NAY/).getByRole('checkbox', { name: 'Đánh dấu xong: Chuyển tiền nhà tháng 10' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không lưu được thay đổi. Hãy thử lại.')
    expect(group(/HÔM NAY/).getByRole('checkbox', { name: 'Đánh dấu xong: Chuyển tiền nhà tháng 10' })).not.toBeChecked()
    expect(titles('ĐÃ XONG')).toEqual(['Xác nhận lịch khám'])
  })

  it('saves the notes on the server', async () => {
    const api = backend()
    open('/tasks/task-print')
    const user = userEvent.setup()
    await screen.findByRole('complementary', { name: 'Chi tiết việc' })
    const notes = detail().getByRole('textbox', { name: 'Ghi chú' })

    await user.type(notes, 'Hỏi cả giá giấy')
    await user.click(detail().getByRole('heading', { level: 2 }))

    await vi.waitFor(() => expect(api.patched).toEqual([['task-print', { notes: 'Hỏi cả giá giấy' }]]))
    expect(api.tasks().find((item) => item.id === 'task-print')?.notes).toBe('Hỏi cả giá giấy')
  })

  it('shows only what a task of the server has: no reminder, no message, nothing related, no action without a flow', async () => {
    backend()
    open('/tasks/task-rent')

    await screen.findByRole('complementary', { name: 'Chi tiết việc' })
    expect(detail().getByRole('heading', { level: 2, name: 'Chuyển tiền nhà tháng 10' })).toBeInTheDocument()
    const facts = Object.fromEntries(
      detail()
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    )
    expect(facts).toEqual({ Hạn: 'Thứ Sáu 02/10 · 17:00', 'Lặp lại': 'Hằng tháng · ngày 2', 'Tạo lúc': expect.any(String) })
    expect(detail().queryByText('Tin nhắn gốc')).not.toBeInTheDocument()
    expect(detail().queryByText('Liên quan')).not.toBeInTheDocument()
    expect(detail().queryByRole('button', { name: 'Nhắc lại sau…' })).not.toBeInTheDocument()
    expect(detail().queryByRole('button', { name: 'Thêm thao tác' })).not.toBeInTheDocument()
  })
})
