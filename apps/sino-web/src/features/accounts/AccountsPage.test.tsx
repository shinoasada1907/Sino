import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp, shellPart } from '@/test/renderApp'
import { createAccountsSample } from './accounts.sample'
import type { AccountsData } from './accounts.types'

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function openAccounts(change?: (list: AccountsData) => void) {
  const accounts = createAccountsSample(NOW)
  change?.(accounts)
  return renderApp('/accounts', { shell: createShellSample(NOW), accounts })
}

const table = () => screen.getByRole('table', { name: 'Tài khoản đã kết nối' })
/** The account rows of the table (the header row has column headers, not cells). */
const bodyRows = () => within(table()).queryAllByRole('row').filter((row) => within(row).queryAllByRole('cell').length > 1)
const row = (account: string) => within(table()).getByRole('row', { name: new RegExp(account.replace(/[.+]/g, '\\$&')) })
const mobileList = () => screen.getByRole('navigation', { name: 'Tài khoản đã kết nối' })
/** Matches an element whose whole text (across child elements) is `text`. */
const wholeText = (text: string) => (_: string, element: Element | null) =>
  element?.textContent === text && !Array.from(element.children).some((child) => child.textContent === text)

describe('Tài khoản', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heads the page and sums up the accounts in the ribbon', async () => {
    openAccounts()

    expect(await screen.findByText('TÀI KHOẢN · 3 ĐÃ KẾT NỐI')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1, name: 'Tài khoản' })).not.toHaveLength(0)
    expect(screen.getByText(/Mỗi tài khoản là một danh tính của bạn ở một nhà cung cấp/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đồng bộ tất cả' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Kết nối tài khoản' })).not.toHaveLength(0)
    expect(screen.getByText('1 ổn định')).toBeInTheDocument()
    expect(screen.getByText('1 đang đồng bộ')).toBeInTheDocument()
    expect(screen.getByText('1 cần đăng nhập lại')).toBeInTheDocument()
    expect(screen.getByText(wholeText('Đồng bộ gần nhất 14:04'))).toBeInTheDocument()
    expect(screen.getByText(wholeText('Đã lưu 3.912 thư và tin nhắn'))).toBeInTheDocument()
  })

  it('warns about the account to sign in to again', async () => {
    openAccounts()

    expect(await screen.findByText('Messenger an.nguyen.92 cần đăng nhập lại')).toBeInTheDocument()
    expect(
      screen.getByText('Quyền truy cập hết hạn lúc 21:04 hôm qua. Tin nhắn mới tạm dừng; 1.204 tin đã lưu vẫn còn.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đăng nhập lại' })).toBeInTheDocument()
  })

  it('lists each account with its sync state, last sync, channels and health', async () => {
    openAccounts()
    await screen.findByRole('table', { name: 'Tài khoản đã kết nối' })

    expect(bodyRows()).toHaveLength(3)
    const gmail = within(row('an.nguyen@gmail.com'))
    expect(gmail.getByText('Gmail')).toBeInTheDocument()
    expect(gmail.getByText('Đang hoạt động')).toBeInTheDocument()
    expect(gmail.getByText('2 phút trước')).toBeInTheDocument()
    expect(gmail.getByText('3')).toBeInTheDocument()
    expect(gmail.getByText('Tốt · quyền tự gia hạn')).toBeInTheDocument()
    const zalo = within(row('+84 9•• ••• 218'))
    expect(zalo.getByText('Đang đồng bộ · 64%')).toBeInTheDocument()
    expect(zalo.getByText('vừa xong')).toBeInTheDocument()
    expect(zalo.getByText('Quyền hết hạn sau 5 ngày')).toBeInTheDocument()
    const messenger = within(row('an.nguyen.92'))
    expect(messenger.getByText('Tạm dừng')).toBeInTheDocument()
    expect(messenger.getByText('Hôm qua, 21:04')).toBeInTheDocument()
    expect(messenger.getByText('Cần đăng nhập lại')).toBeInTheDocument()
    expect(screen.getByText(/cho biết dữ liệu có đang về không/)).toBeInTheDocument()
  })

  it('finds accounts without Vietnamese marks and says when nothing matches', async () => {
    openAccounts()
    const search = await screen.findByRole('searchbox', { name: 'Tìm tài khoản' })

    await userEvent.type(search, 'nguyen.92')
    expect(bodyRows()).toHaveLength(1)
    expect(row('an.nguyen.92')).toBeInTheDocument()

    await userEvent.clear(search)
    await userEvent.type(search, 'Nguyễn')
    expect(bodyRows()).toHaveLength(3)

    await userEvent.type(search, ' Lan')
    expect(bodyRows()).toHaveLength(0)
    expect(within(table()).getByText('Không có tài khoản nào khớp')).toBeInTheDocument()
  })

  it('keeps only the accounts that need attention', async () => {
    openAccounts()
    const filter = within(await screen.findByRole('group', { name: 'Lọc tài khoản' }))
    expect(filter.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(filter.getByRole('button', { name: 'Cần xử lý' }))
    expect(filter.getByRole('button', { name: 'Cần xử lý' })).toHaveAttribute('aria-pressed', 'true')
    expect(filter.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'false')
    expect(bodyRows()).toHaveLength(1)
    expect(row('an.nguyen.92')).toBeInTheDocument()
    // The headline counts every account, and the mobile list (which has no filter) keeps them all.
    expect(screen.getByText('TÀI KHOẢN · 3 ĐÃ KẾT NỐI')).toBeInTheDocument()
    expect(within(mobileList()).getAllByRole('link')).toHaveLength(3)

    await userEvent.click(filter.getByRole('button', { name: 'Tất cả' }))
    expect(bodyRows()).toHaveLength(3)
  })

  it('opens the detail of an account from its row', async () => {
    const { router } = openAccounts()
    await screen.findByRole('table', { name: 'Tài khoản đã kết nối' })

    await userEvent.click(within(row('an.nguyen@gmail.com')).getByRole('link', { name: 'Mở chi tiết tài khoản Gmail an.nguyen@gmail.com' }))

    expect(router.state.location.pathname).toBe('/accounts/acc-gmail')
  })

  it('leaves the page and the list as they are when a button without a flow yet is pressed', async () => {
    const { router } = openAccounts()
    await screen.findByRole('table', { name: 'Tài khoản đã kết nối' })

    for (const name of ['Đồng bộ tất cả', 'Kết nối tài khoản', 'Đăng nhập lại', 'Thêm tài khoản']) {
      for (const button of screen.getAllByRole('button', { name })) {
        await userEvent.click(button)
      }
    }

    expect(router.state.location.pathname).toBe('/accounts')
    expect(bodyRows()).toHaveLength(3)
  })

  it('says so when no account is connected', async () => {
    openAccounts((list) => {
      list.accounts = []
    })

    expect(await within(table()).findByText('Chưa kết nối tài khoản nào.')).toBeInTheDocument()
    expect(screen.queryByText('Không có tài khoản nào khớp')).toBeNull()
  })
})

describe('Tài khoản on mobile', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has its own header with a way back to Thêm, instead of the shell top bar', async () => {
    openAccounts()
    const header = (await screen.findByText('3 TÀI KHOẢN · 1 CẦN XỬ LÝ')).closest('header')!

    expect(within(header).getByRole('heading', { level: 1, name: 'Tài khoản' })).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Quay lại Thêm' })).toHaveAttribute('href', '/more')
    expect(within(header).getByRole('button', { name: 'Thêm tài khoản' })).toBeInTheDocument()
    expect(shellPart('topbar')).toHaveClass('max-md:hidden')
  })

  it('lists every account with its state, each opening its detail', async () => {
    openAccounts()
    const list = within(await screen.findByRole('navigation', { name: 'Tài khoản đã kết nối' }))

    const links = list.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/accounts/acc-gmail', '/accounts/acc-zalo', '/accounts/acc-messenger'])
    expect(within(links[0]).getByText('Gmail')).toBeInTheDocument()
    expect(within(links[0]).getByText('Ổn định')).toBeInTheDocument()
    expect(within(links[1]).getByRole('img', { name: 'Đã đồng bộ 64%' })).toBeInTheDocument()
    expect(within(links[2]).getByText('Quyền hết hạn từ 21:04 hôm qua')).toBeInTheDocument()
    expect(within(mobileList().parentElement!).getByText(/Thông tin đăng nhập được mã hóa trước khi lưu/)).toBeInTheDocument()
  })
})
