import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import { createInboxSample } from './inbox.sample'

// The screen on the full contract (sample data with messages and sending); the API path is tested in InboxOnApi.test.tsx.
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
}

// The account chips above the list (messages-by-account, D-428): the chips are per account, not per provider.
const sources = () => within(screen.getByRole('group', { name: 'Tài khoản' }))
const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
// The header of the list (title, count, view buttons) sits above the scrolling rows, in the same column.
const pane = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }).parentElement as HTMLElement)
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
const row = (name: RegExp) => list().getByRole('link', { name })
// Rows only: the list also has "Thư mới" (f10-new-mail).
const rowTitles = () =>
  list()
    .queryAllByRole('link')
    .flatMap((link) => link.querySelector('[data-slot="row-title"]')?.textContent ?? [])

describe('Hộp thư on desktop', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the emails by day, each with its source, preview, flag and time', async () => {
    open('/inbox')

    expect(await pane().findAllByRole('heading', { level: 1, name: 'Hộp thư' })).not.toHaveLength(0)
    expect(pane().getAllByText('7 chưa đọc')).not.toHaveLength(0)
    expect(list().getByText('HÔM NAY')).toBeInTheDocument()
    expect(list().getByText('HÔM QUA')).toBeInTheDocument()
    expect(list().getByText('TUẦN NÀY')).toBeInTheDocument()
    expect(rowTitles()).toEqual(['Trần Minh Anh', 'Phòng khám Ánh Dương', 'Thu Trang', 'Điện lực Hà Nội'])

    const contract = within(row(/Trần Minh Anh/))
    expect(contract.getByText('Hợp đồng thuê văn phòng — bản sửa lần 2')).toBeInTheDocument()
    expect(contract.getByText('09:41')).toBeInTheDocument()
    expect(contract.getByText('Task · hạn T4 07/10')).toBeInTheDocument()
    expect(within(row(/Điện lực/)).getByText('Thứ 3')).toBeInTheDocument()
  })

  it('lists the chats of Tin nhắn the same way, with their sources, counts and accounts (f05c)', async () => {
    open('/messages')

    expect(await pane().findAllByText('5 chưa đọc')).not.toHaveLength(0)
    const family = within(row(/Gia đình/))
    // The line under the title: the account, then the size of the group; no provider name (D-430)
    expect(family.getByText(/nhóm 6 người$/)).toHaveTextContent('+84 9•• ••• 218 · nhóm 6 người')
    expect(family.getByText('Hà: Con mua bánh bông lan trứng muối được không mẹ?')).toBeInTheDocument()
    expect(family.getByText('3')).toBeInTheDocument()
    expect(within(row(/Nhóm chạy bộ/)).getByText('Hiện lại theo hẹn · 14:00')).toBeInTheDocument()
    expect(within(row(/Nhóm chạy bộ/)).getByText('Hôm qua')).toBeInTheDocument()
    // A chat sends a message, not a mail (canvas Messages).
    expect(within(row(/Lê Hoàng/)).getByText('Tin hẹn giờ không gửi được')).toBeInTheDocument()
    expect(within(row(/Nhóm sửa nhà/)).getByText('Kiến trúc sư: Em gửi lại bản vẽ tầng 2 đã chỉnh cầu thang.')).toBeInTheDocument()

    expect(sources().getByRole('button', { name: 'Tất cả · 5' })).toBeInTheDocument()
    expect(sources().getByRole('button', { name: '+84 9•• ••• 218 · 4' })).toBeInTheDocument()
    expect(sources().getByRole('button', { name: 'an.nguyen.92' })).toBeInTheDocument()
    expect(sources().queryByRole('button', { name: /gmail/ })).toBeNull()
  })

  it('names the account of each row when a source has more than one, at every width', async () => {
    const inbox = createInboxSample(NOW)
    inbox.accounts.push({ ...inbox.accounts[0], id: 'acc-work', externalAccountId: 'an@congty.vn', address: 'an@congty.vn' })
    inbox.conversations = inbox.conversations.map((item) =>
      item.title === 'Thu Trang' ? { ...item, accountId: 'acc-work', accountIds: ['acc-work'] } : item,
    )
    renderApp('/inbox', { shell: createShellSample(NOW), inbox })

    // The line under the title names the account, not the provider: its mark is on the avatar (D-430).
    const work = await within(await list().findByRole('link', { name: /Thu Trang/ })).findByText('an@congty.vn')
    expect(work).not.toHaveClass('hidden')
    expect(within(row(/Trần Minh Anh/)).getByText('an.nguyen@gmail.com')).not.toHaveClass('hidden')
  })

  it('names every account of a thread found in two accounts, in its row and its header (f05b, D-182)', async () => {
    const inbox = createInboxSample(NOW)
    inbox.accounts.push({ ...inbox.accounts[0], id: 'acc-work', externalAccountId: 'an@congty.vn', address: 'an@congty.vn' })
    inbox.conversations = inbox.conversations.map((item) => (item.id === 'conv-1' ? { ...item, accountIds: ['acc-gmail', 'acc-work'] } : item))
    renderApp('/inbox/conv-1', { shell: createShellSample(NOW), inbox })

    const label = await within(await list().findByRole('link', { name: /Trần Minh Anh/ })).findByText('an.nguyen@gmail.com, an@congty.vn')
    expect(label).toBeInTheDocument()
    expect(await thread().findByText('Gmail · an.nguyen@gmail.com, an@congty.vn')).toBeInTheDocument()
  })

  it('counts each source of Hộp thư, and has no source column', async () => {
    open('/inbox')

    expect(await sources().findByRole('button', { name: 'Tất cả · 7' })).toHaveAttribute('aria-pressed', 'true')
    expect(sources().getByRole('button', { name: 'an.nguyen@gmail.com · 7' })).toBeInTheDocument()
    expect(sources().queryByRole('button', { name: /\+84|an\.nguyen\.92/ })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Nguồn và bộ lọc' })).toBeNull()
  })

  it('filters by source and by quick filter, keeping the choice in the address', async () => {
    const { router } = open('/inbox')
    const user = userEvent.setup()

    await user.click(await sources().findByRole('button', { name: /an\.nguyen@gmail/ }))
    expect(router.state.location.search).toBe('?account=acc-gmail')
    expect(rowTitles()).toEqual(['Trần Minh Anh', 'Phòng khám Ánh Dương', 'Thu Trang', 'Điện lực Hà Nội'])
    expect(pane().getAllByText('7 chưa đọc')).not.toHaveLength(0)
    expect(sources().getByRole('button', { name: /an\.nguyen@gmail/ })).toHaveAttribute('aria-pressed', 'true')

    const views = within(pane().getByRole('group', { name: 'Lọc danh sách' }))
    await user.click(views.getByRole('button', { name: 'Chưa đọc' }))
    expect(router.state.location.search).toBe('?account=acc-gmail&view=unread')
    expect(rowTitles()).toEqual(['Trần Minh Anh', 'Phòng khám Ánh Dương'])
    expect(views.getByRole('button', { name: 'Chưa đọc' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('still filters by the views that no longer have a button, from the address', async () => {
    open('/inbox?account=acc-gmail&view=scheduled')

    expect(await list().findByRole('link', { name: /Thu Trang/ })).toBeInTheDocument()
    expect(rowTitles()).toEqual(['Thu Trang'])
  })

  it('lists the snoozed emails from the address', async () => {
    open('/inbox?view=snoozed')

    expect(await list().findByRole('link', { name: /Nhà sách Lumen/ })).toBeInTheDocument()
    expect(rowTitles()).toEqual(['Nhà sách Lumen'])
  })

  it('asks to pick a conversation when none is open', async () => {
    open('/inbox')

    expect(await thread().findByText('Chọn một cuộc trò chuyện để đọc.')).toBeInTheDocument()
  })

  it('opens an email thread in the right pane, keeping the filter', async () => {
    const { router } = open('/inbox?view=reply')
    const user = userEvent.setup()

    await user.click(await list().findByRole('link', { name: /Trần Minh Anh/ }))

    expect(router.state.location.pathname).toBe('/inbox/conv-1')
    expect(router.state.location.search).toBe('?view=reply')
    expect(row(/Trần Minh Anh/)).toHaveAttribute('aria-current', 'page')
    expect(await thread().findByRole('heading', { level: 2, name: 'Hợp đồng thuê văn phòng — bản sửa lần 2' })).toBeInTheDocument()
    expect(thread().getByText('Gmail · an.nguyen@gmail.com')).toBeInTheDocument()
    expect(thread().getByText('3 thư · 2 tệp')).toBeInTheDocument()
    expect(thread().getByRole('link', { name: /Trả lời: Hợp đồng thuê văn phòng/ })).toHaveTextContent('hạn T4 07/10 · nhắc T2 09:00')
    expect(thread().getByRole('link', { name: /Ký hợp đồng/ })).toHaveTextContent('T5 08/10 14:00')
    expect(thread().getByRole('link', { name: /Điều khoản 4/ })).toHaveAttribute('href', '/notes')
    expect(await thread().findByText('Chào anh An,')).toBeInTheDocument()
    expect(thread().getByText('tới An Nguyễn')).toBeInTheDocument()
    expect(thread().getByText('09:41 hôm nay')).toBeInTheDocument()
    expect(thread().getByText('Hop-dong-thue-VP-v2.pdf')).toBeInTheDocument()
    expect(thread().getByText('1,4 MB')).toBeInTheDocument()
    expect(thread().getByText('Phu-luc-gia.xlsx')).toBeInTheDocument()
  })

  it('folds the older emails, and opens one when it is clicked', async () => {
    open('/inbox/conv-1')
    const user = userEvent.setup()

    const folded = await thread().findByRole('button', { name: /Bạn.*Gửi anh bản hợp đồng đầu tiên/ })
    expect(folded).toHaveAttribute('aria-expanded', 'false')
    expect(within(folded).getByText('28/09')).toBeInTheDocument()
    expect(thread().getByRole('button', { name: /Trần Minh Anh.*Em đã xem/ })).toHaveAttribute('aria-expanded', 'false')

    await user.click(folded)

    expect(thread().getByRole('button', { name: /Bạn/ })).toHaveAttribute('aria-expanded', 'true')
    expect(thread().getByText('28/09 · 16:20')).toBeInTheDocument()
  })

  it('marks an email as read when it opens, in its row and the counts of the screen', async () => {
    open('/inbox')
    const user = userEvent.setup()
    expect(within(await list().findByRole('link', { name: /Phòng khám/ })).getByLabelText('Chưa đọc')).toBeInTheDocument()

    await user.click(row(/Phòng khám/))

    expect(await pane().findAllByText('6 chưa đọc')).not.toHaveLength(0)
    expect(sources().getByRole('button', { name: 'an.nguyen@gmail.com · 6' })).toBeInTheDocument()
    expect(within(row(/Phòng khám/)).queryByLabelText('Chưa đọc')).toBeNull()
  })

  it('says so for a conversation that does not exist', async () => {
    open('/inbox/conv-khong-co')

    expect(await thread().findByText('Không tìm thấy cuộc trò chuyện này.')).toBeInTheDocument()
    expect(thread().getByRole('link', { name: 'Về hộp thư' })).toHaveAttribute('href', '/inbox')
  })

  it('leaves everything as it is when a button without a flow yet is pressed', async () => {
    const { router } = open('/inbox/conv-1')
    const user = userEvent.setup()
    await thread().findByText('Chào anh An,')

    for (const name of [
      'Tìm trong cuộc trò chuyện',
      'Tạm ẩn',
      'Mở trong Gmail',
      'Tạo task',
      'Nhắc tôi',
      'Lịch hẹn',
      'Ghi chú',
      'Đính kèm tệp',
      'Tùy chọn gửi: Gửi lúc…',
    ]) {
      await user.click(thread().getByRole('button', { name }))
    }

    expect(router.state.location.pathname).toBe('/inbox/conv-1')
    expect(rowTitles()).toHaveLength(4)
  })
})
