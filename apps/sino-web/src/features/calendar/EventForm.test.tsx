import { http, HttpResponse } from 'msw'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_WEEK, event, storedEvent } from '@/test/fixtures/calendarApi'
import { stubViewport } from '@/test/matchMedia'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import type { CalendarEvent, EventBody, StoredEvent } from './calendar.types'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')

const TEAM_SERIES = storedEvent({
  id: 'event-team',
  title: 'Họp nhóm',
  startsAt: '2026-10-08T03:00:00Z',
  endsAt: '2026-10-08T04:00:00Z',
  location: 'Phòng 3',
  notes: 'Mang laptop.',
  recurrence: { freq: 'WEEKLY', interval: 1, byWeekdays: ['THURSDAY'], byMonthDay: null, untilDate: null, count: null },
})

const TRIP_SERIES = storedEvent({
  id: 'event-trip',
  title: 'Về quê',
  startDate: '2026-10-03',
  endDate: '2026-10-05',
})

function calendarBackend(options: { refuse?: boolean; refuseRule?: boolean } = {}) {
  const created: EventBody[] = []
  const updated: [string, EventBody][] = []
  const deleted: string[] = []
  const stored = new Map<string, StoredEvent>([
    ['event-team', TEAM_SERIES],
    ['event-trip', TRIP_SERIES],
  ])
  const extraOccurrences: CalendarEvent[] = []

  server.use(
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/calendar', ({ request }) => {
      const params = new URL(request.url).searchParams
      const from = params.get('from') ?? ''
      const to = params.get('to') ?? ''
      const baseEvents =
        from === '2026-10-19'
          ? [
              event({
                id: 'event-team@2026-10-22',
                eventId: 'event-team',
                title: stored.get('event-team')?.title ?? 'Họp nhóm',
                startsAt: '2026-10-22T03:00:00Z',
                endsAt: '2026-10-22T04:00:00Z',
                location: 'Phòng 3',
                notes: 'Mang laptop.',
                recurrence: TEAM_SERIES.recurrence,
              }),
            ]
          : API_WEEK.events.filter((item) => stored.has(item.eventId))
      return HttpResponse.json({
        ...API_WEEK,
        from,
        to,
        events: [...baseEvents.filter((item) => !deleted.includes(item.eventId)), ...extraOccurrences],
      })
    }),
    http.get('/api/events/:id', ({ params }) => {
      const found = stored.get(String(params.id))
      return found ? HttpResponse.json(found) : HttpResponse.json({ code: 'EVENT_NOT_FOUND' }, { status: 404 })
    }),
    http.post('/api/events', async ({ request }) => {
      if (options.refuse) {
        return HttpResponse.json({ code: 'INTERNAL_ERROR' }, { status: 500 })
      }
      if (options.refuseRule) {
        return HttpResponse.json({ code: 'INVALID_RECURRENCE', detail: 'Bad recurrence' }, { status: 422 })
      }
      const body = (await request.json()) as EventBody
      created.push(body)
      const saved = storedEvent({ id: 'event-new', ...body })
      stored.set(saved.id, saved)
      const day = body.startDate ?? body.startsAt?.slice(0, 10) ?? '2026-10-08'
      extraOccurrences.push(
        event({
          id: `${saved.id}@${day}`,
          eventId: saved.id,
          title: saved.title,
          startsAt: saved.startsAt,
          endsAt: saved.endsAt,
          startDate: saved.startDate,
          endDate: saved.endDate,
          location: saved.location,
          notes: saved.notes,
          recurrence: saved.recurrence,
        }),
      )
      return HttpResponse.json(saved, { status: 201 })
    }),
    http.put('/api/events/:id', async ({ params, request }) => {
      if (options.refuse) {
        return HttpResponse.json({ code: 'INTERNAL_ERROR' }, { status: 500 })
      }
      if (options.refuseRule) {
        return HttpResponse.json({ code: 'INVALID_RECURRENCE', detail: 'Bad recurrence' }, { status: 422 })
      }
      const id = String(params.id)
      const body = (await request.json()) as EventBody
      updated.push([id, body])
      const saved = storedEvent({ id, ...body })
      stored.set(id, saved)
      return HttpResponse.json(saved)
    }),
    http.delete('/api/events/:id', ({ params }) => {
      if (options.refuse) {
        return HttpResponse.json({ code: 'INTERNAL_ERROR' }, { status: 500 })
      }
      const id = String(params.id)
      deleted.push(id)
      stored.delete(id)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return { created, updated, deleted }
}

const dialog = (name: 'Lịch hẹn mới' | 'Sửa lịch hẹn') => within(screen.getByRole('dialog', { name }))
const detail = () => within(screen.getByRole('complementary', { name: 'Chi tiết lịch hẹn' }))

describe('the appointment form on a wide screen (FE-73)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens from "Lịch hẹn", defaults to today when the range includes today, and creates a repeating timed appointment', async () => {
    const api = calendarBackend()
    const { router } = renderApp('/calendar')
    const user = userEvent.setup()

    const cal = within(await screen.findByRole('region', { name: 'Lịch' }))
    await user.click(cal.getByRole('link', { name: 'Lịch hẹn' }))

    expect(router.state.location.pathname).toBe('/calendar/new')
    const form = dialog('Lịch hẹn mới')
    expect(form.getByLabelText('Ngày')).toHaveValue('2026-10-02')
    expect(form.getByLabelText('Giờ bắt đầu')).toHaveValue('09:00')
    expect(form.getByLabelText('Giờ kết thúc')).toHaveValue('10:00')
    expect(form.getByText('Lịch hẹn chỉ nằm trong Sino, không gửi lời mời cho ai.')).toBeInTheDocument()
    expect(form.getByText('Giờ Việt Nam · GMT+7')).toBeInTheDocument()
    expect(form.queryByText('Nhắc tôi')).toBeNull()

    await user.type(form.getByRole('textbox', { name: 'Tiêu đề' }), 'Họp thiết kế')
    fireEvent.change(form.getByLabelText('Ngày'), { target: { value: '2026-10-02' } })
    fireEvent.change(form.getByLabelText('Giờ bắt đầu'), { target: { value: '10:00' } })
    fireEvent.change(form.getByLabelText('Giờ kết thúc'), { target: { value: '11:00' } })
    await user.type(form.getByRole('textbox', { name: 'Địa điểm' }), 'Phòng 2')
    await user.selectOptions(form.getByRole('combobox', { name: 'Lặp lại' }), 'Hằng tuần')
    await user.type(form.getByRole('textbox', { name: 'Ghi chú' }), 'Xem bản vẽ.')
    await user.click(form.getByRole('button', { name: 'Tạo lịch hẹn' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/calendar'))
    expect(api.created).toEqual([
      {
        title: 'Họp thiết kế',
        startsAt: '2026-10-02T03:00:00.000Z',
        endsAt: '2026-10-02T04:00:00.000Z',
        startDate: null,
        endDate: null,
        location: 'Phòng 2',
        notes: 'Xem bản vẽ.',
        recurrence: { freq: 'WEEKLY', interval: 1, byWeekdays: ['FRIDAY'], byMonthDay: null, untilDate: null, count: null },
      },
    ])
    expect(await screen.findByRole('link', { name: /Họp thiết kế/ })).toBeInTheDocument()
  })

  it('defaults to the range anchor when the viewed range does not include today, and creates an all-day appointment', async () => {
    const api = calendarBackend()
    renderApp('/calendar/new?date=2026-10-12')
    const user = userEvent.setup()

    await screen.findByRole('dialog', { name: 'Lịch hẹn mới' })
    const form = dialog('Lịch hẹn mới')
    expect(form.getByLabelText('Ngày')).toHaveValue('2026-10-12')

    await user.type(form.getByRole('textbox', { name: 'Tiêu đề' }), 'Nghỉ phép')
    await user.click(form.getByRole('button', { name: 'Cả ngày' }))
    expect(form.getByRole('button', { name: 'Cả ngày' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(form.getByRole('button', { name: 'Tạo lịch hẹn' }))

    await vi.waitFor(() =>
      expect(api.created).toEqual([
        {
          title: 'Nghỉ phép',
          startsAt: null,
          endsAt: null,
          startDate: '2026-10-12',
          endDate: '2026-10-13',
          location: null,
          notes: null,
          recurrence: null,
        },
      ]),
    )
  })

  it('refuses an end time before the start time (11:00 – 10:00) and keeps the form open', async () => {
    const api = calendarBackend()
    const { router } = renderApp('/calendar/new')
    const user = userEvent.setup()

    await screen.findByRole('dialog', { name: 'Lịch hẹn mới' })
    const form = dialog('Lịch hẹn mới')
    await user.type(form.getByRole('textbox', { name: 'Tiêu đề' }), 'Họp nhanh')
    fireEvent.change(form.getByLabelText('Giờ bắt đầu'), { target: { value: '11:00' } })
    fireEvent.change(form.getByLabelText('Giờ kết thúc'), { target: { value: '10:00' } })
    await user.click(form.getByRole('button', { name: 'Tạo lịch hẹn' }))

    expect(form.getByText('Giờ kết thúc phải sau giờ bắt đầu.')).toBeInTheDocument()
    expect(form.getByLabelText('Giờ bắt đầu')).toHaveAttribute('aria-invalid', 'true')
    expect(router.state.location.pathname).toBe('/calendar/new')
    expect(api.created).toEqual([])
  })

  it('edits a repeating series from a later occurrence (22/10), showing the first occurrence date (08/10) and "Áp dụng cho mọi lần lặp"', async () => {
    const api = calendarBackend()
    const { router } = renderApp('/calendar/event-team@2026-10-22?date=2026-10-19')
    const user = userEvent.setup()

    await screen.findByRole('complementary', { name: 'Chi tiết lịch hẹn' })
    await user.click(detail().getAllByRole('link', { name: 'Sửa' })[0])

    expect(router.state.location.pathname).toBe('/calendar/event-team@2026-10-22/edit')
    await screen.findByRole('dialog', { name: 'Sửa lịch hẹn' })
    const form = dialog('Sửa lịch hẹn')
    expect(form.getByRole('textbox', { name: 'Tiêu đề' })).toHaveValue('Họp nhóm')
    expect(form.getByLabelText('Ngày')).toHaveValue('2026-10-08')
    expect(form.getByLabelText('Giờ bắt đầu')).toHaveValue('10:00')
    expect(form.getByLabelText('Giờ kết thúc')).toHaveValue('11:00')
    expect(form.getByRole('combobox', { name: 'Lặp lại' })).toHaveDisplayValue('Hằng tuần')
    expect(form.getByText('Áp dụng cho mọi lần lặp')).toBeInTheDocument()

    const title = form.getByRole('textbox', { name: 'Tiêu đề' })
    await user.clear(title)
    await user.type(title, 'Họp nhóm sản phẩm')
    await user.click(form.getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/calendar/event-team@2026-10-22'))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.updated).toEqual([
      [
        'event-team',
        {
          title: 'Họp nhóm sản phẩm',
          startsAt: '2026-10-08T03:00:00.000Z',
          endsAt: '2026-10-08T04:00:00.000Z',
          startDate: null,
          endDate: null,
          location: 'Phòng 3',
          notes: 'Mang laptop.',
          recurrence: { freq: 'WEEKLY', interval: 1, byWeekdays: ['THURSDAY'], byMonthDay: null, untilDate: null, count: null },
        },
      ],
    ])
    expect(await detail().findByRole('heading', { level: 2, name: 'Họp nhóm sản phẩm' })).toBeInTheDocument()
  })

  it('shows a server 422 error next to the repeat field and keeps the form open', async () => {
    calendarBackend({ refuseRule: true })
    const { router } = renderApp('/calendar/event-team@2026-10-01/edit')
    const user = userEvent.setup()

    await screen.findByRole('dialog', { name: 'Sửa lịch hẹn' })
    const form = dialog('Sửa lịch hẹn')
    fireEvent.change(form.getByLabelText('Ngày'), { target: { value: '2026-10-09' } })
    await user.click(form.getByRole('button', { name: 'Lưu' }))

    expect(await form.findByText('Lặp lại không khớp với ngày bắt đầu.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/calendar/event-team@2026-10-01/edit')
  })

  it('asks before deleting a single appointment ("Xóa lịch hẹn này?") and a repeating series ("Xóa cả chuỗi lịch hẹn này?")', async () => {
    const api = calendarBackend()
    const { router } = renderApp('/calendar/event-trip@2026-10-03')
    const user = userEvent.setup()

    await screen.findByRole('complementary', { name: 'Chi tiết lịch hẹn' })
    await user.click(detail().getByRole('button', { name: 'Xóa lịch hẹn' }))
    const singleConfirm = within(screen.getByRole('dialog', { name: 'Xóa lịch hẹn này?' }))
    expect(singleConfirm.getByText('“Về quê” sẽ bị xóa.')).toBeInTheDocument()
    await user.click(singleConfirm.getByRole('button', { name: 'Xóa' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/calendar'))
    expect(api.deleted).toEqual(['event-trip'])

    const week = within(await screen.findByRole('region', { name: /^Tuần / }))
    await user.click(await week.findByRole('link', { name: /Họp nhóm/ }))
    await screen.findByRole('complementary', { name: 'Chi tiết lịch hẹn' })
    await user.click(detail().getByRole('button', { name: 'Xóa lịch hẹn' }))
    const seriesConfirm = within(screen.getByRole('dialog', { name: 'Xóa cả chuỗi lịch hẹn này?' }))
    expect(seriesConfirm.getByText('Mọi lần lặp của “Họp nhóm” sẽ bị xóa.')).toBeInTheDocument()
    await user.click(seriesConfirm.getByRole('button', { name: 'Xóa' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/calendar'))
    expect(api.deleted).toEqual(['event-trip', 'event-team'])
  })
})

describe('the appointment form on a phone (FE-73)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(390)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a page of its own with a way back to the calendar and no tab bar', async () => {
    calendarBackend()
    renderApp('/calendar/new')

    expect(await screen.findByRole('heading', { level: 1, name: 'Lịch hẹn mới' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('link', { name: 'Quay lại Lịch' })).toHaveAttribute('href', '/calendar')
    expect(document.querySelector('[data-slot="tabbar"]')).toBeNull()
  })
})
