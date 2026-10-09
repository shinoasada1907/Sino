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

const findMonth = async () => within(await screen.findByRole('region', { name: 'Tháng 10' }))
const findAgenda = async () => within(await screen.findByRole('region', { name: 'Lịch trình' }))
const cell = (month: ReturnType<typeof within>, date: string) => within(month.getByTestId(`day-${date}`))

describe('Lịch by month', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    // The calendar picks its layout in JavaScript (D-89 note in tasks.md): these are the desktop layouts.
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the weeks of October from Monday 28/9, with today marked and the days outside faded', async () => {
    open('/calendar?view=month')
    const month = await findMonth()

    expect(month.getAllByRole('columnheader').map((head) => head.textContent)).toEqual(['THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY', 'CHỦ NHẬT'])
    expect(month.getAllByRole('gridcell')).toHaveLength(35)
    expect(month.getAllByRole('gridcell')[0]).toHaveTextContent(/^28\/9/)
    expect(month.getAllByRole('gridcell')[0]).toHaveAttribute('data-out', 'true')
    expect(month.getByTestId('day-2026-10-02')).toHaveAttribute('aria-current', 'date')
  })

  it('lists the items of each day by time, opening appointments here and tasks in their screen', async () => {
    open('/calendar?view=month')
    const month = await findMonth()

    const monday = cell(month, '2026-10-05')
    expect(monday.getAllByRole('link').map((link) => link.textContent)).toEqual(['08:30 Khám sức khỏe', '09:00 Báo cáo tuần', '09:00 Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2'])
    expect(monday.getByRole('link', { name: '08:30 Khám sức khỏe' })).toHaveAttribute('href', '/calendar/event-checkup?view=month')
    expect(monday.getByRole('link', { name: '09:00 Báo cáo tuần' })).toHaveAttribute('href', '/tasks/task-weekly')
    expect(cell(month, '2026-10-19').getByRole('link', { name: '09:00 Báo cáo tuần' })).toHaveAttribute('href', '/tasks/task-weekly')
    expect(cell(month, '2026-09-30').getByRole('link', { name: '17:00 Gửi lại hóa đơn tháng 9 cho kế toán' })).toHaveAttribute('data-tone', 'over')
  })

  it('shows three items of a full day and a link to that day for the rest', async () => {
    const { router } = open('/calendar?view=month')
    const user = userEvent.setup()
    const today = cell(await findMonth(), '2026-10-02')

    expect(today.getAllByRole('link').slice(0, 3).map((link) => link.textContent)).toEqual([
      'Trả lời: Ảnh chuyến đi Đà Lạt',
      '07:45 Xác nhận lịch khám với Phòng khám Ánh Dương',
      '08:12 Gửi lại hóa đơn tháng 9 cho kế toán',
    ])
    await user.click(today.getByRole('link', { name: '+4 mục' }))

    expect(router.state.location.search).toBe('?date=2026-10-02')
  })
})

describe('Lịch as an agenda', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    // The calendar picks its layout in JavaScript (D-89 note in tasks.md): these are the desktop layouts.
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the days from today with their items, as the canvas does', async () => {
    open('/calendar?view=agenda')
    const agenda = await findAgenda()

    const days = agenda.getAllByRole('listitem').filter((item) => item.dataset.day)
    expect(days.map((day) => day.dataset.day)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07', '2026-10-08', '2026-10-11', '2026-10-12', '2026-10-15'])
    const today = within(days[0])
    expect(today.getByText('Hôm nay')).toBeInTheDocument()
    expect(today.getByText('THỨ SÁU 02/10')).toBeInTheDocument()
    const bill = today.getByRole('link', { name: /Gửi lại hóa đơn tháng 9 cho kế toán.*Quá hạn 2 ngày/ })
    expect(bill).toHaveTextContent('Hạn 30/09')
    expect(bill).toHaveAttribute('href', '/tasks/task-bill')
    expect(within(bill).getByText('Quá hạn 2 ngày')).toHaveClass('text-danger-ink')
    const call = today.getByRole('link', { name: /Gọi Minh Anh về phụ lục giá/ })
    expect(call).toHaveTextContent('16:00 – 17:00')
    expect(call).toHaveTextContent('Trần Minh Anh')
    expect(call).toHaveTextContent('sau 2 giờ')
    expect(call).toHaveAttribute('href', '/calendar/event-call?view=agenda')
    expect(today.getByRole('link', { name: /Nhắc: Trả lời “Ảnh chuyến đi Đà Lạt”/ })).toHaveTextContent('Đã báo')
    expect(within(days[2]).getByRole('link', { name: /Chạy bộ Hồ Tây/ })).toHaveTextContent('Mỗi Chủ nhật')
  })

  it('opens an appointment from the agenda in the right column', async () => {
    const { router } = open('/calendar?view=agenda')
    const user = userEvent.setup()

    await user.click((await findAgenda()).getByRole('link', { name: /Về nhà ăn cơm/ }))

    expect(router.state.location.pathname).toBe('/calendar/event-home')
    expect(within(screen.getByRole('complementary', { name: 'Chi tiết lịch hẹn' })).getByRole('heading', { level: 2, name: 'Về nhà ăn cơm' })).toBeInTheDocument()
  })
})
