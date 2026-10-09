import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp, shellPart } from '@/test/renderApp'
import { saveTaskNotes } from './tasks.api'
import { createTasksSample } from './tasks.sample'
import type { TasksData } from './tasks.types'
import { TASKS_QUERY_KEY } from './useTasks'

vi.mock('./tasks.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./tasks.api')>()
  return { ...api, saveTaskNotes: vi.fn(api.saveTaskNotes) }
})

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW), tasks: createTasksSample(NOW) })
}

const list = () => within(screen.getByRole('region', { name: 'Danh sách việc' }))
const group = (name: string | RegExp) => within(list().getByRole('region', { name }))
const detail = () => within(screen.getByRole('complementary', { name: 'Chi tiết việc' }))
const titles = (name: string | RegExp) =>
  group(name)
    .queryAllByRole('link')
    .map((link) => link.querySelector('[data-slot="task-title"]')?.textContent)

describe('Việc cần làm on desktop', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the tasks in their groups with their lines, as the canvas does', () => {
    open('/tasks')

    expect(list().getByRole('heading', { level: 1, name: 'Việc cần làm' })).toBeInTheDocument()
    expect(list().getByText(/8 việc đang mở/)).toHaveTextContent('8 việc đang mở · 1 quá hạn · 5 việc tạo từ tin nhắn')
    expect(list().getByText('1 quá hạn')).toHaveClass('text-danger-ink')
    expect(group('QUÁ HẠN').getByText('QUÁ HẠN')).toHaveClass('text-danger-ink')
    expect(group('SẮP TỚI').getByText('SẮP TỚI')).not.toHaveClass('text-danger-ink')
    expect(list().getAllByRole('region').map((section) => section.getAttribute('aria-label'))).toEqual([
      'QUÁ HẠN',
      'HÔM NAY · THỨ SÁU 02/10',
      'SẮP TỚI',
      'KHÔNG CÓ HẠN',
      'ĐÃ XONG',
    ])
    expect(titles('SẮP TỚI')).toEqual([
      'Mua bánh bông lan trứng muối cho bà',
      'Báo cáo tuần',
      'Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2',
      'Gia hạn bảo hiểm TA-2025-0418',
    ])
    const bill = group('QUÁ HẠN').getByRole('link', { name: /Gửi lại hóa đơn/ })
    expect(bill).toHaveTextContent('Hạn 30/09 · trễ 2 ngày')
    expect(within(bill).getByText('Hạn 30/09 · trễ 2 ngày')).toHaveClass('text-danger-ink')
    expect(bill).toHaveTextContent('Đã nhắc 08:12')
    expect(group('SẮP TỚI').getByRole('link', { name: /Hợp đồng thuê/ })).toHaveTextContent('T4 07/10 · 17:00T2 05/10 09:00Trần Minh Anh')
    expect(group('ĐÃ XONG').getByRole('link', { name: /Báo cáo tuần/ })).toHaveTextContent('Xong T2 28/09Đã tạo lần kế tiếp: T2 05/10')
    expect(group('ĐÃ XONG').getByRole('checkbox', { name: 'Đánh dấu xong: Báo cáo tuần' })).toBeChecked()
    expect(group('QUÁ HẠN').getByRole('checkbox', { name: 'Đánh dấu xong: Gửi lại hóa đơn tháng 9 cho kế toán' })).not.toBeChecked()
  })

  it('asks to pick a task while none is open', () => {
    open('/tasks')
    expect(detail().getByText('Chọn một việc để xem chi tiết.')).toBeInTheDocument()
  })

  it('filters by source and by repeat, keeping the choice in the address', async () => {
    const { router } = open('/tasks')
    const user = userEvent.setup()
    const filters = within(list().getByRole('group', { name: 'Lọc việc' }))

    await user.click(filters.getByRole('button', { name: 'Từ tin nhắn' }))
    expect(router.state.location.search).toBe('?filter=messages')
    expect(list().queryByRole('region', { name: 'QUÁ HẠN' })).toBeNull()
    expect(titles('ĐÃ XONG')).toEqual(['Xác nhận lịch khám với Phòng khám Ánh Dương'])

    await user.click(filters.getByRole('button', { name: 'Lặp lại' }))
    expect(router.state.location.search).toBe('?filter=repeat')
    expect(list().getAllByRole('link').map((link) => link.querySelector('[data-slot="task-title"]')?.textContent)).toEqual([
      'Chuyển tiền nhà tháng 10',
      'Báo cáo tuần',
      'Báo cáo tuần',
    ])

    await user.click(filters.getByRole('button', { name: 'Tất cả' }))
    expect(router.state.location.search).toBe('')
  })

  it('reads an unknown filter in the address as "Tất cả"', () => {
    open('/tasks?filter=starred')
    expect(within(list().getByRole('group', { name: 'Lọc việc' })).getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('adds a task with Enter, keeps the box ready for the next one, and ignores an empty one', async () => {
    open('/tasks')
    const user = userEvent.setup()
    const box = list().getByRole('textbox', { name: 'Thêm việc mới' })
    expect(box).toHaveAttribute('maxlength', '200')

    await user.type(box, 'Gọi điện cho thợ sửa máy lạnh{Enter}')

    expect(titles('KHÔNG CÓ HẠN')).toEqual(['Gọi điện cho thợ sửa máy lạnh', 'Hỏi Hoàng giá in bản thiết kế'])
    expect(box).toHaveValue('')
    expect(box).toHaveFocus()
    expect(list().getByText(/9 việc đang mở/)).toBeInTheDocument()

    await user.type(box, '   {Enter}')
    expect(titles('KHÔNG CÓ HẠN')).toHaveLength(2)
  })

  it('completes a repeating task: it moves to Đã xong and its next occurrence appears; the navigation follows', async () => {
    open('/tasks')
    const user = userEvent.setup()

    await user.click(group(/HÔM NAY/).getByRole('checkbox', { name: 'Đánh dấu xong: Chuyển tiền nhà tháng 10' }))

    expect(group('ĐÃ XONG').getByRole('link', { name: /Chuyển tiền nhà/ })).toHaveTextContent('Xong 14:05 hôm nayĐã tạo lần kế tiếp: T2 02/11')
    expect(group('SẮP TỚI').getByRole('link', { name: /Chuyển tiền nhà/ })).toHaveTextContent('T2 02/11 · 17:00')
    expect(within(shellPart('sidebar')).getByRole('link', { name: 'Việc cần làm, 2 tới hạn' })).toBeInTheDocument()
  })

  it('reopens a done task into the group of its due', async () => {
    open('/tasks')
    const user = userEvent.setup()

    await user.click(group('ĐÃ XONG').getByRole('checkbox', { name: 'Đánh dấu xong: Xác nhận lịch khám với Phòng khám Ánh Dương' }))

    expect(group('QUÁ HẠN').getByRole('checkbox', { name: 'Đánh dấu xong: Xác nhận lịch khám với Phòng khám Ánh Dương' })).not.toBeChecked()
  })

  it('opens a task in the right column with all of its detail', async () => {
    const { router } = open('/tasks?filter=messages')
    const user = userEvent.setup()

    await user.click(group('SẮP TỚI').getByRole('link', { name: /Hợp đồng thuê/ }))

    expect(router.state.location.pathname).toBe('/tasks/task-contract')
    expect(router.state.location.search).toBe('?filter=messages')
    expect(group('SẮP TỚI').getByRole('link', { name: /Hợp đồng thuê/ })).toHaveAttribute('aria-current', 'page')
    expect(detail().getByRole('heading', { level: 2, name: 'Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2' })).toBeInTheDocument()
    const facts = Object.fromEntries(
      detail()
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    )
    expect(facts).toEqual({ Hạn: 'Thứ Tư 07/10 · 17:00', Nhắc: 'Thứ Hai 05/10 · 09:00', 'Lặp lại': 'Không', 'Tạo lúc': '09:52 hôm nay, từ Hộp thư' })
    const source = detail().getByRole('link', { name: /Trần Minh Anh · Gmail/ })
    expect(source).toHaveAttribute('href', '/inbox/conv-1')
    expect(source).toHaveTextContent('Hợp đồng thuê văn phòng — bản sửa lần 2')
    expect(detail().getByRole('textbox', { name: 'Ghi chú' })).toHaveValue('Xem điều khoản 4 và phụ lục giá trước khi trả lời. Minh Anh cần phản hồi trước thứ Tư.')
    expect(detail().getByRole('link', { name: /Điều khoản 4/ })).toHaveAttribute('href', '/notes')
    expect(detail().getByRole('link', { name: /Ký hợp đồng/ })).toHaveTextContent('Ký hợp đồngT5 08/10')
    expect(detail().getByRole('link', { name: /Ký hợp đồng/ })).toHaveAttribute('href', '/calendar')

    await user.click(detail().getByRole('link', { name: 'Đóng' }))
    expect(router.state.location.pathname).toBe('/tasks')
    expect(router.state.location.search).toBe('?filter=messages')
  })

  it('saves the notes when the box loses focus', async () => {
    const { queryClient } = open('/tasks/task-print')
    const user = userEvent.setup()
    const notes = detail().getByRole('textbox', { name: 'Ghi chú' })

    await user.type(notes, 'Hỏi cả giá in 2 mặt.')
    await user.tab()

    const saved = queryClient.getQueryData<TasksData>(TASKS_QUERY_KEY)!.tasks.find((task) => task.id === 'task-print')
    expect(saved?.notes).toBe('Hỏi cả giá in 2 mặt.')
    expect(saveTaskNotes).toHaveBeenCalledTimes(1)
  })

  it('saves nothing when the notes did not change', async () => {
    open('/tasks/task-contract')
    const user = userEvent.setup()

    await user.click(detail().getByRole('textbox', { name: 'Ghi chú' }))
    await user.tab()

    expect(saveTaskNotes).not.toHaveBeenCalled()
  })

  it('names the repeat rule of a repeating task in its detail', () => {
    open('/tasks/task-rent')
    expect(detail().getByText('Lặp lại').nextElementSibling).toHaveTextContent('Hằng tháng · ngày 2')
  })

  it('marks the open task done from its detail, and reopens it', async () => {
    open('/tasks/task-weekly')
    const user = userEvent.setup()

    await user.click(detail().getByRole('button', { name: 'Đánh dấu xong' }))
    expect(detail().getByRole('checkbox', { name: 'Đánh dấu xong' })).toBeChecked()
    await user.click(detail().getByRole('button', { name: 'Mở lại' }))
    expect(detail().getByRole('checkbox', { name: 'Đánh dấu xong' })).not.toBeChecked()
  })

  it('says when the message a task came from was removed', () => {
    open('/tasks/task-insurance')

    const missing = detail().getByText('Tin nhắn gốc đã bị xóa')
    expect(missing.closest('a')).toBeNull()
    expect(detail().getByText('Bảo hiểm Tâm An · Gmail')).toBeInTheDocument()
  })

  it('says so for a task that does not exist', () => {
    open('/tasks/task-nope')

    expect(detail().getByText('Không tìm thấy việc này.')).toBeInTheDocument()
    expect(detail().getByRole('link', { name: 'Về danh sách việc' })).toHaveAttribute('href', '/tasks')
  })

  it('leaves the task as it is when a button without a flow yet is pressed', async () => {
    const { router, queryClient } = open('/tasks/task-contract')
    const user = userEvent.setup()
    const before = queryClient.getQueryData<TasksData>(TASKS_QUERY_KEY)

    for (const name of ['Thêm thao tác', 'Nhắc lại sau…', 'Xóa task']) {
      await user.click(detail().getByRole('button', { name }))
    }

    expect(router.state.location.pathname).toBe('/tasks/task-contract')
    expect(queryClient.getQueryData<TasksData>(TASKS_QUERY_KEY)).toBe(before)
  })
})
