import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import { createOverviewSample } from './overview.sample'
import type { OverviewData } from './overview.types'

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function openOverview(change?: (overview: OverviewData) => void) {
  const overview = createOverviewSample(NOW)
  change?.(overview)
  return renderApp('/overview', { shell: createShellSample(NOW), overview })
}

const card = (name: string) => within(screen.getByRole('region', { name }))
/** Matches an element whose whole text (across child elements) is `text`. */
const wholeText = (text: string) => (_: string, element: Element | null) =>
  element?.textContent === text && !Array.from(element.children).some((child) => child.textContent === text)

describe('Tổng quan', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('greets the owner by short name and sums up the accounts', async () => {
    openOverview()

    expect(await screen.findByRole('heading', { level: 1, name: 'Chào buổi chiều, An.' })).toBeInTheDocument()
    expect(screen.getByText('THỨ SÁU · 02/10/2026 · 14:05')).toBeInTheDocument()
    expect(screen.getByText('Hai tài khoản đang chạy bình thường.')).toBeInTheDocument()
    expect(screen.getAllByText('Messenger cần đăng nhập lại')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Đồng bộ ngay' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kết nối tài khoản' })).toBeInTheDocument()
  })

  it('shows the unified inbox: waiting conversations and the share of each source', async () => {
    openOverview()
    await screen.findByRole('heading', { level: 1 })
    const inbox = card('Hộp thư hợp nhất')

    expect(inbox.getByText('12 chưa đọc')).toBeInTheDocument()
    expect(inbox.getByText('3 cuộc trò chuyện đang chờ bạn trả lời.')).toBeInTheDocument()
    expect(inbox.getByText('Trần Minh Anh')).toBeInTheDocument()
    expect(inbox.getByText('09:41')).toBeInTheDocument()
    expect(inbox.getByText('Hôm qua')).toBeInTheDocument()
    expect(inbox.getByText(wholeText('Gia đình · Zalo · nhóm 6 người'))).toBeInTheDocument()
    const gmailShare = inbox.getByRole('img', { name: 'Gmail: 7 chưa đọc, 58%' })
    expect(gmailShare.firstElementChild).toHaveStyle({ width: '58%' })
  })

  it('lists today: an overdue task, a finished one, an appointment, a repeating task and a reminder', async () => {
    openOverview()
    await screen.findByRole('heading', { level: 1 })
    const today = card('Hôm nay · Thứ Sáu 02/10')

    expect(today.getByText('4 việc · 1 lịch hẹn')).toBeInTheDocument()
    expect(today.getByText('30/09')).toBeInTheDocument()
    expect(today.getByText('Quá hạn 2 ngày')).toBeInTheDocument()
    expect(today.getByText('Đã xong')).toBeInTheDocument()
    expect(today.getByText('sau 2 giờ')).toBeInTheDocument()
    expect(today.getByText('Trần Minh Anh')).toBeInTheDocument()
    expect(today.getByText('Hằng tháng')).toBeInTheDocument()
    expect(today.getAllByRole('button', { name: 'Đánh dấu xong' })).toHaveLength(2)
    expect(today.getByText(wholeText('Ngày mai: Về nhà ăn cơm 18:30 · 1 việc'))).toBeInTheDocument()
  })

  it('shows the state of every account', async () => {
    openOverview()
    await screen.findByRole('heading', { level: 1 })
    const accounts = card('Tài khoản')

    expect(accounts.getByText('3 · 1 cần xử lý')).toBeInTheDocument()
    expect(accounts.getByText('an.nguyen@gmail.com')).toBeInTheDocument()
    expect(accounts.getByText('Ổn định')).toBeInTheDocument()
    expect(accounts.getByRole('img', { name: 'Đã đồng bộ 64%' })).toBeInTheDocument()
    expect(accounts.getByText('Quyền hết hạn từ 21:04 hôm qua')).toBeInTheDocument()
    expect(accounts.getByRole('button', { name: 'Đăng nhập lại' })).toBeInTheDocument()
  })

  it('charts the last 24 hours of sync with the problems named', async () => {
    openOverview()
    await screen.findByRole('heading', { level: 1 })
    const sync = card('Dịch vụ · đồng bộ 24 giờ qua')

    expect(sync.getByText('1.284 thư')).toBeInTheDocument()
    expect(
      sync.getByRole('img', {
        name: 'Số thư đồng bộ mỗi giờ trong 24 giờ qua. Messenger lỗi lúc 21 giờ, Zalo chậm lúc 13 giờ.',
      }),
    ).toBeInTheDocument()
    expect(sync.getByText('15:00 hôm qua')).toBeInTheDocument()
    expect(sync.getByText('Zalo · chậm lúc 13:58')).toBeInTheDocument()
    expect(sync.getByText('Messenger · lỗi từ 21:04')).toBeInTheDocument()
  })

  it('shows the registrations by sign-in method and the latest one', async () => {
    openOverview()
    await screen.findByRole('heading', { level: 1 })
    const registrations = card('Đăng ký')

    expect(registrations.getByText('48')).toBeInTheDocument()
    expect(registrations.getByText('cập nhật 11:40')).toBeInTheDocument()
    expect(registrations.getByRole('img', { name: 'Cách đăng nhập: Google 21, Email 14, Facebook 8, Zalo 5' })).toBeInTheDocument()
    expect(registrations.getByText('Diễn đàn Mây')).toBeInTheDocument()
    expect(registrations.getByText('Mới')).toBeInTheDocument()
    expect(registrations.getByText('may.forum · qua Zalo · 30/09')).toBeInTheDocument()
  })

  it('tells the recent activity in sentences', async () => {
    openOverview()
    await screen.findByRole('heading', { level: 1 })
    const activity = card('Hoạt động gần đây')

    expect(activity.getByText('14:02')).toBeInTheDocument()
    expect(activity.getByText('Zalo đồng bộ lại sau 4 phút mất kết nối.')).toBeInTheDocument()
    expect(activity.getByText(wholeText('Phát hiện đăng ký mới: Diễn đàn Mây, đăng nhập bằng Zalo.'))).toBeInTheDocument()
    expect(activity.getByText('Diễn đàn Mây').tagName).toBe('STRONG')
    expect(activity.getByText('Quyền truy cập Messenger hết hạn lúc 21:04.')).toBeInTheDocument()
    expect(activity.getByText('29/09')).toBeInTheDocument()
  })

  it('offers the shortcuts with their keys', async () => {
    openOverview()
    await screen.findByRole('heading', { level: 1 })
    const shortcuts = card('Lối tắt')

    expect(shortcuts.getAllByRole('button')).toHaveLength(5)
    expect(shortcuts.getByRole('button', { name: /Tìm kiếm/ })).toHaveTextContent('Ctrl K')
    expect(shortcuts.getByRole('button', { name: /Xem lại đăng ký/ })).toHaveTextContent('G R')
  })

  it('keeps the other cards when the backend has no data for one of them yet', async () => {
    openOverview((overview) => {
      overview.inbox = null
      overview.activity = null
    })
    await screen.findByRole('heading', { level: 1 })

    expect(card('Hộp thư hợp nhất').getByText('Chưa có dữ liệu')).toBeInTheDocument()
    expect(card('Hoạt động gần đây').getByText('Chưa có dữ liệu')).toBeInTheDocument()
    expect(card('Đăng ký').getByText('48')).toBeInTheDocument()
  })

  // The links are checked by address and one is followed: going to and back from three whole screens made this test
  // slow enough to fail when every test file runs at once.
  it('opens the inbox, the calendar and the notifications from their links', async () => {
    const user = userEvent.setup()
    const { router } = openOverview()
    await screen.findByRole('heading', { level: 1 })

    for (const link of card('Hộp thư hợp nhất').getAllByRole('link', { name: 'Mở hộp thư' })) {
      expect(link).toHaveAttribute('href', '/inbox')
    }
    expect(screen.getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/notifications')
    await user.click(screen.getByRole('link', { name: 'Mở lịch' }))
    expect(router.state.location.pathname).toBe('/calendar')
  })

  it('leaves the action buttons without effect for now', async () => {
    const user = userEvent.setup()
    const { router } = openOverview()
    await screen.findByRole('heading', { level: 1 })

    await user.click(screen.getByRole('button', { name: 'Đồng bộ ngay' }))
    await user.click(card('Tài khoản').getByRole('button', { name: 'Đăng nhập lại' }))
    await user.click(card('Lối tắt').getByRole('button', { name: /Tạo task/ }))

    expect(router.state.location.pathname).toBe('/overview')
  })
})
