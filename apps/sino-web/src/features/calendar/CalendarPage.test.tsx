import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { stubViewport } from '@/test/matchMedia'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW) })
}

const calendar = () => within(screen.getByRole('region', { name: 'Lịch' }))
const week = () => within(screen.getByRole('region', { name: /^Tuần / }))
// The calendar loads on its own: wait for the week before looking inside it.
const findWeek = async () => within(await screen.findByRole('region', { name: /^Tuần / }))
const detail = () => within(screen.getByRole('complementary', { name: 'Chi tiết lịch hẹn' }))
// The whole screen waits for its data (CalendarSkeleton), so the first look at it is a find.
const findCalendar = async () => within(await screen.findByRole('region', { name: 'Lịch' }))
const findDetail = async () => within(await screen.findByRole('complementary', { name: 'Chi tiết lịch hẹn' }))

describe('Lịch on desktop', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    // The calendar picks its layout in JavaScript (D-89 note in tasks.md): these are the desktop layouts.
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heads the week with its number and days, the views and the legend', async () => {
    open('/calendar')

    expect(await (await findCalendar()).findByRole('heading', { level: 1, name: '28/09 – 04/10' })).toBeInTheDocument()
    expect(calendar().getByText('TUẦN 40 · 2026')).toBeInTheDocument()
    expect(within(calendar().getByRole('group', { name: 'Chế độ xem' })).getByRole('button', { name: 'Tuần' })).toHaveAttribute('aria-pressed', 'true')
    for (const item of ['Lịch hẹn', 'Task có hạn', 'Nhắc nhở', 'Lặp lại', 'Tạo từ tin nhắn', 'Giờ Việt Nam · GMT+7']) {
      expect(within(calendar().getByRole('list', { name: 'Chú giải' })).getByText(item)).toBeInTheDocument()
    }
  })

  it('draws the week of the canvas: days, the whole-day row, appointments, task chips, reminder marks and now', async () => {
    open('/calendar')

    await (await findWeek()).findByRole('link', { name: /Gọi Minh Anh về phụ lục giá/ })
    expect(week().getByText('02').closest('[aria-current="date"]')).not.toBeNull()
    expect(week().getByRole('link', { name: /Sinh nhật Hà/ })).toHaveAttribute('href', '/calendar/event-birthday')
    const call = week().getByRole('link', { name: /Gọi Minh Anh về phụ lục giá/ })
    expect(call).toHaveTextContent('16:00 – 17:00')
    expect(call).toHaveTextContent('Trần Minh Anh')
    expect(call).toHaveStyle({ top: '736px', height: '46px' })
    expect(week().getByRole('link', { name: /Về nhà ăn cơm/ })).toHaveStyle({ top: '851px', height: '115px' })
    expect(week().getByRole('link', { name: /Họp thiết kế với Lê Hoàng/ })).toHaveAttribute('data-past', 'true')
    const rent = week().getByRole('link', { name: 'Chuyển tiền nhà tháng 10' })
    expect(rent).toHaveAttribute('href', '/tasks/task-rent')
    expect(rent).toHaveStyle({ top: '784px' })
    expect(week().getByRole('link', { name: 'Gửi lại hóa đơn tháng 9 cho kế toán' })).toHaveAttribute('data-tone', 'over')
    expect(week().getByRole('link', { name: 'Xác nhận lịch khám với Phòng khám Ánh Dương' })).toHaveAttribute('data-tone', 'done')
    expect(week().getByRole('link', { name: '18:00 Mua bánh bông lan trứng muối cho bà' })).toHaveAttribute('href', '/tasks/task-cake')
    expect(week().getByRole('img', { name: 'Bây giờ 14:05' })).toBeInTheDocument()
  })

  it('moves to the next week and back to today, keeping it in the address', async () => {
    const { router } = open('/calendar')
    const user = userEvent.setup()
    await (await findCalendar()).findByRole('heading', { level: 1, name: '28/09 – 04/10' })

    await user.click(calendar().getByRole('button', { name: 'Khoảng sau' }))
    expect(router.state.location.search).toBe('?date=2026-10-09')
    expect(await (await findCalendar()).findByRole('heading', { level: 1, name: '05/10 – 11/10' })).toBeInTheDocument()
    expect(calendar().getByText('TUẦN 41 · 2026')).toBeInTheDocument()

    await user.click(calendar().getByRole('button', { name: 'Khoảng trước' }))
    await user.click(calendar().getByRole('button', { name: 'Khoảng trước' }))
    expect(router.state.location.search).toBe('?date=2026-09-25')

    await user.click(calendar().getByRole('button', { name: 'Hôm nay' }))
    expect(router.state.location.search).toBe('')

    await user.click(within(calendar().getByRole('group', { name: 'Chế độ xem' })).getByRole('button', { name: 'Tháng' }))
    expect(router.state.location.search).toBe('?view=month')
    expect(calendar().getByText('THÁNG 10 · 2026')).toBeInTheDocument()
  })

  it('opens an appointment in the right column, with all of its detail', async () => {
    const { router } = open('/calendar?date=2026-10-03')
    const user = userEvent.setup()

    await user.click(await (await findWeek()).findByRole('link', { name: /Về nhà ăn cơm/ }))

    expect(router.state.location.pathname).toBe('/calendar/event-home')
    expect(router.state.location.search).toBe('?date=2026-10-03')
    expect(week().getByRole('link', { name: /Về nhà ăn cơm/ })).toHaveAttribute('aria-current', 'page')
    expect(detail().getByText('Lịch hẹn')).toBeInTheDocument()
    expect(detail().getByRole('heading', { level: 2, name: 'Về nhà ăn cơm' })).toBeInTheDocument()
    expect(detail().getByText('Thứ Bảy 03/10 · 18:30 – 21:00')).toBeInTheDocument()
    const facts = Object.fromEntries(detail().getAllByRole('term').map((term) => [term.textContent, term.nextElementSibling?.textContent]))
    expect(facts).toEqual({ Nhắc: '17:30 · 1 giờ trước', 'Lặp lại': 'Không', 'Địa điểm': 'Nhà bố mẹ' })
    const source = detail().getByRole('link', { name: /Gia đình · Zalo/ })
    expect(source).toHaveAttribute('href', '/inbox/conv-2')
    expect(source).toHaveTextContent('Mẹ: Cuối tuần này cả nhà về ăn cơm nhé, nhớ mua bánh cho bà.')
    expect(detail().getByText('Mang thêm trái cây. Bà thích bánh bông lan trứng muối.')).toBeInTheDocument()
    expect(detail().getByRole('link', { name: /Mua bánh bông lan trứng muối cho bà/ })).toHaveAttribute('href', '/tasks/task-cake')

    await user.click(detail().getByRole('link', { name: 'Đóng' }))
    expect(router.state.location.pathname).toBe('/calendar')
    expect(router.state.location.search).toBe('?date=2026-10-03')
    expect(screen.queryByRole('complementary', { name: 'Chi tiết lịch hẹn' })).toBeNull()
  })

  it('names an email source by its subject', async () => {
    open('/calendar/event-call')

    const source = await (await findDetail()).findByRole('link', { name: /Trần Minh Anh · Gmail/ })
    expect(source).toHaveTextContent('Hợp đồng thuê văn phòng — bản sửa lần 2')
    expect(source).not.toHaveTextContent('Chào anh An')
  })

  it('opens the open task of a series from a coming occurrence', async () => {
    open('/calendar?date=2026-10-12')

    expect(await (await findWeek()).findByRole('link', { name: 'Báo cáo tuần' })).toHaveAttribute('href', '/tasks/task-weekly')
  })

  it('calls an occurrence of a repeating appointment so', async () => {
    open('/calendar/event-run@2026-10-04')

    expect(await (await findDetail()).findByText('Lịch hẹn lặp lại')).toBeInTheDocument()
    expect(detail().getByText('Lặp lại').nextElementSibling).toHaveTextContent('Mỗi Chủ nhật')
  })

  it('opens the detail column only once an appointment is picked, and says so for one it does not know', async () => {
    const view = open('/calendar')
    await findWeek()
    expect(screen.queryByRole('complementary', { name: 'Chi tiết lịch hẹn' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Lịch' }).parentElement).not.toHaveClass('xl:grid-cols-[minmax(0,1fr)_340px]')
    view.unmount()

    open('/calendar/event-nope')
    expect(await (await findDetail()).findByText('Không tìm thấy lịch hẹn này.')).toBeInTheDocument()
    expect(detail().getByRole('link', { name: 'Về lịch' })).toHaveAttribute('href', '/calendar')
  })

  it('opens a task from its chip in the Việc cần làm screen', async () => {
    const { router } = open('/calendar')
    const user = userEvent.setup()

    await user.click(await (await findWeek()).findByRole('link', { name: 'Chuyển tiền nhà tháng 10' }))

    expect(router.state.location.pathname).toBe('/tasks/task-rent')
  })

  it('leaves everything as it is when a button without a flow yet is pressed', async () => {
    const { router } = open('/calendar/event-home?date=2026-10-03')
    const user = userEvent.setup()
    await (await findDetail()).findByRole('heading', { level: 2, name: 'Về nhà ăn cơm' })

    await user.click(calendar().getByRole('button', { name: 'Lịch hẹn' }))
    for (const button of [...detail().getAllByRole('button', { name: 'Sửa' }), detail().getByRole('button', { name: 'Thêm thao tác' }), detail().getByRole('button', { name: 'Xóa lịch hẹn' })]) {
      await user.click(button)
    }

    expect(router.state.location.pathname).toBe('/calendar/event-home')
    expect(week().getByRole('link', { name: /Về nhà ăn cơm/ })).toBeInTheDocument()
  })
})
