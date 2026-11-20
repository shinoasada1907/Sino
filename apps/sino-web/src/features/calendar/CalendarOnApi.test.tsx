import { http, HttpResponse } from 'msw'
import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_WEEK, event, task } from '@/test/fixtures/calendarApi'
import { stubViewport } from '@/test/matchMedia'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import { tasksBackend } from '@/test/tasksBackend'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')

function serveCalendar(custom?: (from: string, to: string) => Partial<typeof API_WEEK>) {
  const ranges: [string, string][] = []
  server.use(
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/calendar', ({ request }) => {
      const params = new URL(request.url).searchParams
      const from = params.get('from') ?? ''
      const to = params.get('to') ?? ''
      ranges.push([from, to])
      return HttpResponse.json({ ...API_WEEK, from, to, ...custom?.(from, to) })
    }),
  )
  return { ranges }
}

const findCalendar = async () => within(await screen.findByRole('region', { name: 'Lịch' }))
const findWeek = async () => within(await screen.findByRole('region', { name: /^Tuần / }))
const findDetail = async () => within(await screen.findByRole('complementary', { name: 'Chi tiết lịch hẹn' }))

describe('Lịch on the F17 API (FE-72)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads each range from GET /api/calendar across Week, Month, Agenda and on a phone', async () => {
    const api = serveCalendar()
    const user = userEvent.setup()
    const view = renderApp('/calendar')

    const week = await findWeek()
    expect(await week.findByRole('link', { name: /Họp nhóm/ })).toHaveTextContent('10:00 – 11:00')
    expect(week.getAllByRole('link', { name: /Về quê/ })[0]).toHaveAttribute('href', '/calendar/event-trip@2026-10-03')
    expect(week.getByRole('link', { name: 'Báo cáo tuần' })).toHaveAttribute('href', '/tasks/task-report')
    expect(api.ranges).toEqual([['2026-09-28', '2026-10-05']])

    const cal = await findCalendar()
    await user.click(within(cal.getByRole('group', { name: 'Chế độ xem' })).getByRole('button', { name: 'Tháng' }))
    expect(await screen.findByRole('grid', { name: 'Tháng 10' })).toBeInTheDocument()
    expect(api.ranges.at(-1)).toEqual(['2026-09-28', '2026-11-02'])

    await user.click(within(cal.getByRole('group', { name: 'Chế độ xem' })).getByRole('button', { name: 'Lịch trình' }))
    expect(await screen.findByRole('region', { name: 'Lịch trình' })).toBeInTheDocument()
    expect(api.ranges.at(-1)).toEqual(['2026-10-02', '2026-10-16'])
    view.unmount()

    stubViewport(390)
    renderApp('/calendar')
    expect(await screen.findByRole('group', { name: 'Tuần 28/09 – 04/10' })).toBeInTheDocument()
    expect(api.ranges.at(-1)).toEqual(['2026-09-28', '2026-10-16'])
  })

  it('opens the open task of a repeating series when a coming occurrence chip is clicked', async () => {
    serveCalendar((from) => ({
      tasks:
        from === '2026-10-12'
          ? [task({ id: 'task-weekly@2026-10-19', taskId: 'task-weekly', title: 'Báo cáo tuần', dueAt: '2026-10-18T02:00:00Z' })]
          : API_WEEK.tasks,
    }))
    const user = userEvent.setup()
    const { router } = renderApp('/calendar?date=2026-10-12')

    const week = await findWeek()
    const chip = await week.findByRole('link', { name: 'Báo cáo tuần' })
    expect(chip).toHaveAttribute('href', '/tasks/task-weekly')

    await user.click(chip)
    expect(router.state.location.pathname).toBe('/tasks/task-weekly')
  })

  it('shows only the fields an appointment from the server has, and hides "Thêm thao tác"', async () => {
    serveCalendar()
    const user = userEvent.setup()
    const { router } = renderApp('/calendar')

    const week = await findWeek()
    expect(screen.queryByRole('complementary', { name: 'Chi tiết lịch hẹn' })).toBeNull()

    await user.click(await week.findByRole('link', { name: /Họp nhóm/ }))
    const detail = await findDetail()
    expect(router.state.location.pathname).toBe('/calendar/event-team@2026-10-01')
    expect(detail.getByText('Lịch hẹn lặp lại')).toBeInTheDocument()
    expect(detail.getByRole('heading', { level: 2, name: 'Họp nhóm' })).toBeInTheDocument()
    expect(detail.getByText('Thứ Năm 01/10 · 10:00 – 11:00')).toBeInTheDocument()
    const facts = Object.fromEntries(detail.getAllByRole('term').map((term) => [term.textContent, term.nextElementSibling?.textContent]))
    expect(facts).toEqual({ 'Lặp lại': 'Mỗi thứ Năm', 'Địa điểm': 'Phòng 3' })
    expect(detail.getByText('Mang laptop.')).toBeInTheDocument()
    expect(detail.queryByText('Nhắc')).toBeNull()
    expect(detail.queryByText('Tạo từ tin nhắn')).toBeNull()
    expect(detail.queryByText('Liên quan')).toBeNull()
    expect(detail.queryByRole('button', { name: 'Thêm thao tác' })).toBeNull()
    expect(detail.getAllByRole('link', { name: 'Sửa' })).not.toHaveLength(0)
    expect(detail.getByRole('button', { name: 'Xóa lịch hẹn' })).toBeInTheDocument()

    await user.click(week.getAllByRole('link', { name: /Về quê/ })[0])
    const tripDetail = await findDetail()
    expect(tripDetail.getByText('Lịch hẹn')).toBeInTheDocument()
    const tripFacts = Object.fromEntries(tripDetail.getAllByRole('term').map((term) => [term.textContent, term.nextElementSibling?.textContent]))
    expect(tripFacts).toEqual({ 'Lặp lại': 'Không' })
    expect(tripDetail.queryByText('Ghi chú')).toBeNull()

    await user.click(tripDetail.getByRole('link', { name: 'Đóng' }))
    expect(screen.queryByRole('complementary', { name: 'Chi tiết lịch hẹn' })).toBeNull()
  })

  it('shows a newly scheduled task at 09:00 on Monday 12/10 after refreshing cached calendar ranges', async () => {
    tasksBackend({ now: NOW })
    let scheduled = false
    const api = serveCalendar((from) => ({
      events: [event({ id: 'event-team@2026-10-15', eventId: 'event-team', title: 'Họp nhóm', startsAt: '2026-10-15T03:00:00Z', endsAt: '2026-10-15T04:00:00Z' })],
      tasks:
        scheduled && from === '2026-10-12'
          ? [task({ id: 'task-print', taskId: 'task-print', title: 'Hỏi Hoàng giá in bản thiết kế', dueAt: '2026-10-12T02:00:00Z' })]
          : [],
    }))
    const user = userEvent.setup()
    const { router } = renderApp('/calendar?date=2026-10-12', { tasks: null })

    const week = await findWeek()
    await week.findByRole('link', { name: /Họp nhóm/ })
    expect(week.queryByRole('link', { name: 'Hỏi Hoàng giá in bản thiết kế' })).toBeNull()
    expect(api.ranges).toEqual([['2026-10-12', '2026-10-19']])

    await act(() => router.navigate('/tasks/task-print/edit'))
    const form = within(await screen.findByRole('dialog', { name: 'Sửa việc' }))
    fireEvent.change(form.getByLabelText('Hạn'), { target: { value: '2026-10-12' } })
    await user.selectOptions(form.getByRole('combobox', { name: 'Giờ' }), '09:00')
    scheduled = true
    await user.click(form.getByRole('button', { name: 'Lưu' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await act(() => router.navigate('/calendar?date=2026-10-12'))
    const chip = await (await findWeek()).findByRole('link', { name: 'Hỏi Hoàng giá in bản thiết kế' })
    expect(chip).toHaveAttribute('href', '/tasks/task-print')
    expect(chip).toHaveStyle({ top: '416px' })
    expect(api.ranges).toEqual([
      ['2026-10-12', '2026-10-19'],
      ['2026-10-12', '2026-10-19'],
    ])
  })
})
