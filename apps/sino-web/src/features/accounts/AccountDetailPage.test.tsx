import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp, shellPart } from '@/test/renderApp'
import { createAccountsSample } from './accounts.sample'

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function openDetail(id: string) {
  return renderApp(`/accounts/${id}`, { shell: createShellSample(NOW), accounts: createAccountsSample(NOW) })
}

const card = (name: string) => within(screen.getByRole('region', { name }))
const main = () => within(screen.getByRole('main'))

describe('Chi tiết tài khoản', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('names the account and its state, with a way back to the list', async () => {
    openDetail('acc-gmail')

    expect(await screen.findByRole('heading', { level: 1, name: 'an.nguyen@gmail.com' })).toBeInTheDocument()
    expect(screen.getByText('Gmail · An Nguyễn · kết nối từ 29/09/2026')).toBeInTheDocument()
    expect(main().getAllByText('Đang hoạt động')).not.toHaveLength(0)
    expect(main().getByRole('link', { name: 'Tài khoản' })).toHaveAttribute('href', '/accounts')
    expect(screen.getByRole('button', { name: 'Mở Gmail' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đồng bộ ngay' })).toBeInTheDocument()
  })

  it('shows the channels with a switch each; one needing more scopes cannot be switched', async () => {
    openDetail('acc-gmail')
    const channels = card('Kênh đã kết nối')

    expect(await channels.findByText('3 bật · 1 tắt')).toBeInTheDocument()
    expect(channels.getByRole('switch', { name: 'Thư đến' })).toBeChecked()
    expect(channels.getByRole('switch', { name: 'Gửi thư' })).toBeChecked()
    expect(channels.getByRole('switch', { name: 'Tệp đính kèm' })).toBeChecked()
    expect(channels.getByRole('switch', { name: 'Danh bạ' })).not.toBeChecked()
    expect(channels.getByRole('switch', { name: 'Danh bạ' })).toBeDisabled()
    expect(channels.getByText('Đồng bộ mỗi 15 phút · 1.284 thư')).toBeInTheDocument()
    expect(channels.getByText('Gợi ý người nhận khi soạn thư · cần thêm quyền')).toBeInTheDocument()
  })

  it('turns a channel off, and the list counts one service less', async () => {
    const { router } = openDetail('acc-gmail')
    const channels = card('Kênh đã kết nối')

    await userEvent.click(await channels.findByRole('switch', { name: 'Thư đến' }))
    expect(channels.getByRole('switch', { name: 'Thư đến' })).not.toBeChecked()
    expect(channels.getByText('2 bật · 2 tắt')).toBeInTheDocument()

    await userEvent.click(main().getByRole('link', { name: 'Tài khoản' }))
    expect(router.state.location.pathname).toBe('/accounts')
    const gmailRow = await screen.findByRole('row', { name: /an\.nguyen@gmail\.com/ })
    expect(within(gmailRow).getByText('2')).toBeInTheDocument()
  })

  it('changes only the channel whose switch is pressed', async () => {
    openDetail('acc-gmail')
    const channels = card('Kênh đã kết nối')

    await userEvent.click(await channels.findByRole('switch', { name: 'Gửi thư' }))

    expect(channels.getByRole('switch', { name: 'Gửi thư' })).not.toBeChecked()
    expect(channels.getByRole('switch', { name: 'Thư đến' })).toBeChecked()
    expect(channels.getByText('2 bật · 2 tắt')).toBeInTheDocument()
  })

  it('lists the scopes, the websites, the sync history and the activity', async () => {
    openDetail('acc-gmail')

    const scopes = card('Quyền đã cấp')
    expect(await scopes.findByText('3 quyền')).toBeInTheDocument()
    expect(scopes.getByText('Đọc thư và nhãn')).toBeInTheDocument()
    expect(scopes.getByText('gmail.readonly')).toBeInTheDocument()
    expect(scopes.getByText('Xóa thư, đổi cài đặt Gmail')).toBeInTheDocument()
    expect(scopes.getByText('không xin')).toBeInTheDocument()
    expect(scopes.getByText('Quyền tự gia hạn. Lần gần nhất lúc 13:50.')).toBeInTheDocument()

    const sites = card('Website dùng danh tính này')
    expect(sites.getByRole('button', { name: 'Xem tất cả 21' })).toBeInTheDocument()
    expect(sites.getByText('Ví Hạt Đậu')).toBeInTheDocument()
    expect(sites.getByText('hatdau.vn · đăng nhập bằng Google')).toBeInTheDocument()
    expect(sites.getByText('Độ nhạy cao')).toBeInTheDocument()
    expect(sites.getByText('14/03/2025')).toBeInTheDocument()

    const history = card('Lịch sử đồng bộ')
    expect(history.getByText('hôm nay')).toBeInTheDocument()
    expect(history.getByText('14:03')).toBeInTheDocument()
    expect(history.getByText('+12')).toBeInTheDocument()
    expect(history.getByText('3,1 s')).toBeInTheDocument()
    expect(history.getByText('Chậm')).toBeInTheDocument()

    const activity = card('Hoạt động')
    expect(activity.getByText('01/10 · 09:12')).toBeInTheDocument()
    expect(activity.getByText('Bạn cấp thêm quyền gửi thư.')).toBeInTheDocument()
    expect(activity.getByText('Phát hiện 21 website bạn đăng nhập bằng tài khoản Google này.')).toBeInTheDocument()

    const danger = card('Ngắt kết nối tài khoản')
    expect(danger.getByText(/1\.284 thư đã lưu được giữ lại/)).toBeInTheDocument()
    expect(danger.getByRole('button', { name: 'Ngắt kết nối an.nguyen@gmail.com' })).toBeInTheDocument()
  })

  it('says "Chưa có dữ liệu" in each section the backend has nothing for, and shows the rest', async () => {
    openDetail('acc-zalo')

    expect(await card('Kênh đã kết nối').findByRole('switch', { name: 'Tin nhắn đến' })).toBeChecked()
    for (const name of ['Quyền đã cấp', 'Website dùng danh tính này', 'Lịch sử đồng bộ', 'Hoạt động']) {
      expect(card(name).getByText('Chưa có dữ liệu')).toBeInTheDocument()
    }
  })

  it('warns about an expired account and shows its paused channels as paused', async () => {
    openDetail('acc-messenger')

    expect(await screen.findByText('Messenger an.nguyen.92 cần đăng nhập lại')).toBeInTheDocument()
    const channels = card('Kênh đã kết nối')
    expect(channels.queryByRole('switch', { name: 'Tin nhắn đến' })).toBeNull()
    expect(channels.getByText('Tạm dừng')).toBeInTheDocument()
    expect(channels.getByText('Lần cuối 21:04 hôm qua')).toBeInTheDocument()
    expect(channels.getByRole('switch', { name: 'Gửi tin' })).not.toBeChecked()
    expect(await card('Hoạt động').findByText('Quyền truy cập Messenger hết hạn.')).toBeInTheDocument()
  })

  it('keeps the account when the disconnect dialog is cancelled or closed with Esc', async () => {
    const { router } = openDetail('acc-messenger')
    const user = userEvent.setup()

    await user.click(await card('Ngắt kết nối tài khoản').findByRole('button', { name: 'Ngắt kết nối an.nguyen.92' }))
    const dialog = screen.getByRole('dialog', { name: 'Ngắt kết nối Messenger?' })
    expect(within(dialog).getByText(/1\.204 tin nhắn đã lưu vẫn được giữ lại/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('switch', { name: 'Xóa luôn tin nhắn đã lưu' }))
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // Reopened, the dialog does not remember a choice to delete that was cancelled.
    await user.click(card('Ngắt kết nối tài khoản').getByRole('button', { name: 'Ngắt kết nối an.nguyen.92' }))
    expect(within(screen.getByRole('dialog')).getByRole('switch', { name: 'Xóa luôn tin nhắn đã lưu' })).not.toBeChecked()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()

    expect(router.state.location.pathname).toBe('/accounts/acc-messenger')
    expect(screen.getByRole('heading', { level: 1, name: 'an.nguyen.92' })).toBeInTheDocument()
  })

  it('disconnects after confirming, back on the list without the account', async () => {
    const { router } = openDetail('acc-messenger')
    const user = userEvent.setup()

    await user.click(await card('Ngắt kết nối tài khoản').findByRole('button', { name: 'Ngắt kết nối an.nguyen.92' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Ngắt kết nối Messenger?' }))
    await user.click(dialog.getByRole('switch', { name: 'Xóa luôn tin nhắn đã lưu' }))
    await user.click(dialog.getByRole('button', { name: 'Ngắt kết nối' }))

    expect(router.state.location.pathname).toBe('/accounts')
    expect(await screen.findByText('TÀI KHOẢN · 2 ĐÃ KẾT NỐI')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /an\.nguyen\.92/ })).toBeNull()
    expect(screen.getByText((_, element) => element?.textContent === 'Đã lưu 2.708 thư và tin nhắn' && element.tagName === 'SPAN')).toBeInTheDocument()
  })

  it('says so for an account that does not exist', async () => {
    openDetail('acc-khong-co')

    expect(await main().findByText('Không tìm thấy tài khoản này.')).toBeInTheDocument()
    expect(main().getByRole('link', { name: 'Về danh sách tài khoản' })).toHaveAttribute('href', '/accounts')
  })

  it('keeps Tài khoản current in the shell, titles the tablet top bar and hides the mobile tab bar', async () => {
    openDetail('acc-gmail')
    await screen.findByRole('heading', { level: 1, name: 'an.nguyen@gmail.com' })

    expect(within(shellPart('sidebar')).getByRole('link', { name: /Tài khoản/ })).toHaveAttribute('aria-current', 'page')
    expect(within(shellPart('topbar')).getByText('Tài khoản')).toBeInTheDocument()
    expect(shellPart('topbar')).toHaveClass('max-md:hidden')
    expect(document.querySelector('[data-slot="tabbar"]')).toBeNull()
  })
})

describe('Chi tiết tài khoản on mobile', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has its own header and the blocks of the mobile canvas', async () => {
    openDetail('acc-messenger')
    const header = (await screen.findByRole('link', { name: 'Quay lại Tài khoản' })).closest('header')!

    expect(within(header).getByRole('link', { name: 'Quay lại Tài khoản' })).toHaveAttribute('href', '/accounts')
    expect(within(header).getByRole('heading', { level: 1, name: 'Messenger' })).toBeInTheDocument()
    expect(within(header).getByText('an.nguyen.92')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'an.nguyen.92' })).toBeInTheDocument()
    expect(screen.getByText('Quyền hết hạn từ 21:04 hôm qua')).toBeInTheDocument()
    expect(screen.getByText('Sino không đọc và gửi tin Messenger được')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Đăng nhập lại Messenger' })).toBeInTheDocument()

    const channels = card('Kênh')
    expect(channels.getByText('Tin nhắn đến')).toBeInTheDocument()
    expect(channels.getByText('Tạm dừng')).toBeInTheDocument()
    expect(channels.getByRole('switch', { name: 'Gửi tin' })).toBeInTheDocument()

    const sync = card('Đồng bộ')
    expect(sync.getByText('1.204')).toBeInTheDocument()
    expect(sync.getByText('TIN NHẮN · TỪ 14/09')).toBeInTheDocument()
    expect(sync.getByText('14/09 · 20:15')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Ngắt kết nối Messenger' })).toBeInTheDocument()
    expect(screen.getByText(/Task và ghi chú tạo từ tin Messenger vẫn còn/)).toBeInTheDocument()
  })

  it('opens the same disconnect dialog from the mobile button', async () => {
    openDetail('acc-messenger')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Ngắt kết nối Messenger' }))
    expect(screen.getByRole('dialog', { name: 'Ngắt kết nối Messenger?' })).toBeInTheDocument()
  })
})
