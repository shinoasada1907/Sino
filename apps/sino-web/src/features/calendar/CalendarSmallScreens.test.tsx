import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { stubViewport } from '@/test/matchMedia'
import { renderApp, shellPart } from '@/test/renderApp'
import { fetchCalendar } from './calendar.api'

vi.mock('./calendar.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./calendar.api')>()
  return { ...api, fetchCalendar: vi.fn(api.fetchCalendar) }
})

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW) })
}

const findStrip = async (name = 'Tuần 28/09 – 04/10') => within(await screen.findByRole('group', { name }))
const dots = (day: HTMLElement) => day.querySelectorAll('[aria-hidden="true"] > span').length
const days = () =>
  within(screen.getByRole('region', { name: 'Lịch trình' }))
    .getAllByRole('listitem')
    .filter((item) => item.dataset.day)
    .map((item) => item.dataset.day)

describe('Lịch on a phone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(390)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heads the page as MobileCalendar does, with the days of the week and the agenda from today', async () => {
    open('/calendar')
    const strip = await findStrip()

    expect(screen.getByRole('heading', { level: 1, name: 'Lịch' })).toBeInTheDocument()
    expect(screen.getByText('THÁNG 10 · 2026')).toBeInTheDocument()
    expect(shellPart('topbar')).toHaveClass('max-md:hidden')
    const buttons = strip.getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Thứ Hai 28/09, 1 mục',
      'Thứ Ba 29/09, 1 mục',
      'Thứ Tư 30/09, 1 mục',
      'Thứ Năm 01/10, 1 mục',
      'Thứ Sáu 02/10, 7 mục',
      'Thứ Bảy 03/10, 2 mục',
      'Chủ nhật 04/10, 1 mục',
    ])
    expect(buttons[4]).toHaveAttribute('aria-current', 'date')
    expect(buttons[4]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons.map(dots)).toEqual([1, 1, 1, 1, 3, 2, 1])
    expect(days()).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07', '2026-10-08', '2026-10-11', '2026-10-12', '2026-10-15'])
    const agenda = within(screen.getByRole('region', { name: 'Lịch trình' }))
    const bill = agenda.getByRole('link', { name: /Gửi lại hóa đơn tháng 9 cho kế toán.*Quá hạn 2 ngày/ })
    expect(bill).toHaveAttribute('href', '/tasks/task-bill')
    expect(bill).toHaveTextContent(/^30\/09/)
    const call = agenda.getByRole('link', { name: /Gọi Minh Anh về phụ lục giá/ })
    expect(call).toHaveTextContent(/^16:00Gọi Minh Anh về phụ lục giáTrần Minh Anh$/)
    const sunday = screen.getAllByRole('listitem').find((item) => item.dataset.day === '2026-10-04')!
    expect(sunday.firstElementChild).toHaveTextContent(/^Chủ nhật04\/10$/)
  })

  it('starts the agenda at the day picked in the strip, and goes back to today', async () => {
    const { router } = open('/calendar')
    const user = userEvent.setup()

    await user.click((await findStrip()).getByRole('button', { name: /^Chủ nhật 04\/10/ }))
    expect(router.state.location.search).toBe('?view=agenda&date=2026-10-04')
    expect(days()[0]).toBe('2026-10-04')
    expect((await findStrip()).getByRole('button', { name: /^Chủ nhật 04\/10/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Hôm nay' }))
    expect(router.state.location.search).toBe('?view=agenda')
    expect(days()[0]).toBe('2026-10-02')
  })

  it('names a day with nothing on it without a count', async () => {
    open('/calendar?view=agenda&date=2026-10-06')

    const tuesday = (await findStrip('Tuần 05/10 – 11/10')).getByRole('button', { name: 'Thứ Ba 06/10' })
    expect(tuesday).toHaveAttribute('aria-pressed', 'true')
    expect(dots(tuesday)).toBe(0)
  })

  it('opens an appointment on a page of its own, with a way back and no tab bar', async () => {
    const { router } = open('/calendar?view=agenda')
    const user = userEvent.setup()
    await findStrip()

    await user.click(within(screen.getByRole('region', { name: 'Lịch trình' })).getByRole('link', { name: /Gọi Minh Anh về phụ lục giá/ }))

    expect(router.state.location.pathname).toBe('/calendar/event-call')
    const detail = within(screen.getByRole('complementary', { name: 'Chi tiết lịch hẹn' }))
    expect(detail.getByRole('heading', { level: 1, name: 'Chi tiết lịch hẹn' })).toBeInTheDocument()
    expect(detail.getByRole('link', { name: 'Quay lại Lịch' })).toHaveAttribute('href', '/calendar?view=agenda')
    expect(detail.getByRole('heading', { level: 2, name: 'Gọi Minh Anh về phụ lục giá' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="tabbar"]')).toBeNull()
  })

  it('has a button to add an appointment that does nothing yet', async () => {
    const { router } = open('/calendar')
    const user = userEvent.setup()
    await findStrip()

    await user.click(screen.getByRole('button', { name: 'Thêm lịch hẹn' }))

    expect(router.state.location.pathname).toBe('/calendar')
  })
})

describe('states of the Lịch screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the shape of the calendar while it loads', async () => {
    vi.mocked(fetchCalendar).mockReturnValueOnce(new Promise(() => {}))
    open('/calendar')

    expect(await screen.findByRole('status', { name: 'Đang tải lịch' })).toBeInTheDocument()
  })

  it('says so when the calendar cannot load, and loads it on "Thử lại"', async () => {
    vi.mocked(fetchCalendar).mockRejectedValueOnce(new Error('offline'))
    open('/calendar')
    const user = userEvent.setup()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'Không tải được lịch' })).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByRole('region', { name: /^Tuần / })).toBeInTheDocument()
  })
})
