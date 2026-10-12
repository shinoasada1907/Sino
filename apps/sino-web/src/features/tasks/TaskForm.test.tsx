import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubViewport } from '@/test/matchMedia'
import { renderApp } from '@/test/renderApp'
import { tasksBackend } from '@/test/tasksBackend'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const backend = (options: { refuse?: boolean; refuseRule?: boolean } = {}) => tasksBackend({ now: NOW, ...options })

// While the form is open, the page under it is hidden from assistive technology (and from `getByRole`).
const open = async (path: string) => {
  const view = renderApp(path, { tasks: null })
  await (path.endsWith('/edit') ? screen.findByRole('dialog', { name: 'Sửa việc' }) : screen.findByRole('region', { name: 'Danh sách việc' }))
  return view
}
const form = () => within(screen.getByRole('dialog', { name: 'Sửa việc' }))
// The address changes before the page is drawn again without the form.
const formClosed = () => vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
const list = () => within(screen.getByRole('region', { name: 'Danh sách việc' }))
const detail = () => within(screen.getByRole('complementary', { name: 'Chi tiết việc' }))
const setDate = (label: string, value: string) => fireEvent.change(form().getByLabelText(label), { target: { value } })

describe('the task form on a wide screen (FE-71)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens from the detail of a task, filled from it, as the canvas draws it without a reminder or a message', async () => {
    backend()
    const { router } = await open('/tasks/task-report')
    const user = userEvent.setup()

    await user.click(detail().getByRole('link', { name: 'Sửa' }))

    expect(router.state.location.pathname).toBe('/tasks/task-report/edit')
    expect(form().getByRole('textbox', { name: 'Tiêu đề' })).toHaveValue('Báo cáo tuần')
    expect(form().getByLabelText('Hạn')).toHaveValue('2026-10-05')
    expect(form().getByRole('combobox', { name: 'Giờ' })).toHaveValue('09:00')
    expect(form().getByRole('combobox', { name: 'Lặp lại' })).toHaveDisplayValue('Hằng tuần')
    expect(form().getByText('Giờ Việt Nam · GMT+7')).toBeInTheDocument()
    expect(form().queryByText('Nhắc tôi')).toBeNull()
    expect(form().queryByText('Liên kết với thư')).toBeNull()
  })

  it('gives a task a due at a time of day', async () => {
    const api = backend()
    const { router } = await open('/tasks/task-print/edit')
    const user = userEvent.setup()

    setDate('Hạn', '2026-10-09')
    await user.selectOptions(form().getByRole('combobox', { name: 'Giờ' }), '17:00')
    await user.click(form().getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/tasks/task-print'))
    expect(api.scheduled).toEqual([['task-print', { dueAt: '2026-10-09T10:00:00.000Z', dueDate: null, recurrence: null }]])
    await formClosed()
    expect(within(list().getByRole('region', { name: 'SẮP TỚI' })).getByRole('link', { name: /Hỏi Hoàng/ })).toHaveTextContent('T6 09/10 · 17:00')
  })

  it('gives a task a whole day that comes back every week', async () => {
    const api = backend()
    await open('/tasks/task-print/edit')
    const user = userEvent.setup()

    setDate('Hạn', '2026-10-09')
    await user.selectOptions(form().getByRole('combobox', { name: 'Lặp lại' }), 'Hằng tuần')
    await user.click(form().getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() =>
      expect(api.scheduled).toEqual([
        [
          'task-print',
          {
            dueAt: null,
            dueDate: '2026-10-09',
            recurrence: { freq: 'WEEKLY', interval: 1, byWeekdays: ['FRIDAY'], byMonthDay: null, untilDate: null, count: null },
          },
        ],
      ]),
    )
  })

  it('takes the due away, and the repeat with it', async () => {
    const api = backend()
    await open('/tasks/task-report/edit')
    const user = userEvent.setup()

    setDate('Hạn', '')
    expect(form().getByRole('combobox', { name: 'Lặp lại' })).toBeDisabled()
    expect(form().getByRole('combobox', { name: 'Giờ' })).toBeDisabled()
    await user.click(form().getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() => expect(api.scheduled).toEqual([['task-report', { dueAt: null, dueDate: null, recurrence: null }]]))
    await formClosed()
    expect(await within(list().getByRole('region', { name: 'KHÔNG CÓ HẠN' })).findByRole('link', { name: /Báo cáo tuần/ })).toBeInTheDocument()
  })

  it('sends a custom rule: every two weeks on Monday and Thursday until the end of the year', async () => {
    const api = backend()
    await open('/tasks/task-report/edit')
    const user = userEvent.setup()

    await user.selectOptions(form().getByRole('combobox', { name: 'Lặp lại' }), 'Tùy chỉnh…')
    const every = form().getByRole('spinbutton', { name: 'Mỗi' })
    await user.clear(every)
    await user.type(every, '2')
    expect(form().getByRole('button', { name: 'Thứ Hai' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(form().getByRole('button', { name: 'Thứ Năm' }))
    await user.selectOptions(form().getByRole('combobox', { name: 'Kết thúc' }), 'Vào ngày')
    setDate('Ngày kết thúc', '2026-12-31')
    await user.click(form().getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() =>
      expect(api.scheduled).toEqual([
        [
          'task-report',
          {
            dueAt: '2026-10-05T02:00:00.000Z',
            dueDate: null,
            recurrence: { freq: 'WEEKLY', interval: 2, byWeekdays: ['MONDAY', 'THURSDAY'], byMonthDay: null, untilDate: '2026-12-31', count: null },
          },
        ],
      ]),
    )
  })

  it('says next to the repeat when the server finds it does not fit the due, and keeps the form open', async () => {
    backend({ refuseRule: true })
    const { router } = await open('/tasks/task-report/edit')
    const user = userEvent.setup()

    setDate('Hạn', '2026-10-06')
    await user.click(form().getByRole('button', { name: 'Lưu' }))

    expect(await form().findByText('Lặp lại không khớp với ngày hạn.')).toBeInTheDocument()
    expect(form().getByRole('combobox', { name: 'Lặp lại' })).toHaveAttribute('aria-invalid', 'true')
    expect(router.state.location.pathname).toBe('/tasks/task-report/edit')
  })

  it('says so when the server fails, and keeps what was typed', async () => {
    backend({ refuse: true })
    await open('/tasks/task-report/edit')
    const user = userEvent.setup()

    setDate('Hạn', '2026-10-06')
    await user.click(form().getByRole('button', { name: 'Lưu' }))

    expect(await form().findByText('Không lưu được việc. Hãy thử lại.')).toBeInTheDocument()
    expect(form().getByLabelText('Hạn')).toHaveValue('2026-10-06')
  })

  it('sends nothing when nothing changed', async () => {
    const api = backend()
    const { router } = await open('/tasks/task-report/edit')
    const user = userEvent.setup()

    await user.click(form().getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/tasks/task-report'))
    expect(api.scheduled).toEqual([])
    expect(api.patched).toEqual([])
  })

  it('takes a time of its own', async () => {
    const api = backend()
    await open('/tasks/task-print/edit')
    const user = userEvent.setup()

    setDate('Hạn', '2026-10-09')
    await user.selectOptions(form().getByRole('combobox', { name: 'Giờ' }), 'Giờ khác…')
    fireEvent.change(form().getByLabelText('Giờ khác'), { target: { value: '14:30' } })
    await user.click(form().getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() => expect(api.scheduled).toEqual([['task-print', { dueAt: '2026-10-09T07:30:00.000Z', dueDate: null, recurrence: null }]]))
  })

  it('renames a task and keeps its notes', async () => {
    const api = backend()
    await open('/tasks/task-report/edit')
    const user = userEvent.setup()
    const title = form().getByRole('textbox', { name: 'Tiêu đề' })

    await user.clear(title)
    await user.type(title, 'Báo cáo tuần cho chị Lan')
    await user.click(form().getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() => expect(api.patched).toEqual([['task-report', { title: 'Báo cáo tuần cho chị Lan', notes: '' }]]))
    await formClosed()
    expect(await detail().findByRole('heading', { level: 2, name: 'Báo cáo tuần cho chị Lan' })).toBeInTheDocument()
  })

  it('does not send a blank title', async () => {
    const api = backend()
    await open('/tasks/task-report/edit')
    const user = userEvent.setup()

    await user.clear(form().getByRole('textbox', { name: 'Tiêu đề' }))
    await user.click(form().getByRole('button', { name: 'Lưu' }))

    expect(form().getByText('Tiêu đề không được để trống.')).toBeInTheDocument()
    expect(api.scheduled).toEqual([])
    expect(api.patched).toEqual([])
  })

  it('goes back to the detail it was opened from, with the filter, so Back does not open the form again', async () => {
    backend()
    const { router } = await open('/tasks/task-report?filter=repeat')
    const user = userEvent.setup()

    await user.click(detail().getByRole('link', { name: 'Sửa' }))
    expect(router.state.location.search).toBe('?filter=repeat')
    await user.click(form().getByRole('button', { name: 'Hủy' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/tasks/task-report'))
    expect(router.state.location.search).toBe('?filter=repeat')
    expect(router.state.historyAction).toBe('POP')
  })

  it('changes nothing on "Hủy"', async () => {
    const api = backend()
    const { router } = await open('/tasks/task-report/edit')
    const user = userEvent.setup()

    await user.type(form().getByRole('textbox', { name: 'Tiêu đề' }), ' nữa')
    await user.click(form().getByRole('button', { name: 'Hủy' }))

    expect(router.state.location.pathname).toBe('/tasks/task-report')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.scheduled).toEqual([])
    expect(api.patched).toEqual([])
  })

  it('deletes a task once asked again, and goes back to the list', async () => {
    const api = backend()
    const { router } = await open('/tasks/task-print')
    const user = userEvent.setup()

    await user.click(detail().getByRole('button', { name: 'Xóa task' }))
    const confirm = within(screen.getByRole('dialog', { name: 'Xóa việc này?' }))
    expect(confirm.getByText('“Hỏi Hoàng giá in bản thiết kế” sẽ bị xóa.')).toBeInTheDocument()
    await user.click(confirm.getByRole('button', { name: 'Xóa' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/tasks'))
    expect(api.deleted).toEqual(['task-print'])
    expect(list().queryByRole('link', { name: /Hỏi Hoàng/ })).toBeNull()
  })

  it('keeps the task on "Hủy", and says so when the server refuses to delete it', async () => {
    const api = backend({ refuse: true })
    const { router } = await open('/tasks/task-print')
    const user = userEvent.setup()

    await user.click(detail().getByRole('button', { name: 'Xóa task' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Xóa việc này?' })).getByRole('button', { name: 'Hủy' }))
    expect(api.deleted).toEqual([])

    await user.click(detail().getByRole('button', { name: 'Xóa task' }))
    const confirm = within(screen.getByRole('dialog', { name: 'Xóa việc này?' }))
    await user.click(confirm.getByRole('button', { name: 'Xóa' }))

    expect(await confirm.findByText('Không xóa được việc. Hãy thử lại.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tasks/task-print')
  })
})

describe('the task form on a phone (FE-71)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a page of its own with a way back to the task and no tab bar', async () => {
    backend()
    renderApp('/tasks/task-report/edit', { tasks: null })

    expect(await screen.findByRole('heading', { level: 1, name: 'Sửa việc' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('link', { name: 'Quay lại chi tiết việc' })).toHaveAttribute('href', '/tasks/task-report')
    expect(screen.getByRole('textbox', { name: 'Tiêu đề' })).toHaveValue('Báo cáo tuần')
    expect(document.querySelector('[data-slot="tabbar"]')).toBeNull()
  })
})
