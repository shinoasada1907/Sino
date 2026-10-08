import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp, shellPart } from '@/test/renderApp'
import { createInboxSample } from './inbox.sample'

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
}

const sources = () => within(screen.getByRole('complementary', { name: 'Nguồn và bộ lọc' }))
const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
const row = (name: RegExp) => list().getByRole('link', { name })
const rowTitles = () => list().queryAllByRole('link').map((link) => link.querySelector('[data-slot="row-title"]')?.textContent)

describe('Hộp thư on desktop', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the conversations by day, each with its source, preview, flag and time', async () => {
    open('/inbox')

    expect(await list().findByRole('heading', { level: 1, name: 'Hộp thư' })).toBeInTheDocument()
    expect(list().getByText('12 chưa đọc')).toBeInTheDocument()
    expect(list().getByText('HÔM NAY')).toBeInTheDocument()
    expect(list().getByText('HÔM QUA')).toBeInTheDocument()
    expect(list().getByText('TUẦN NÀY')).toBeInTheDocument()
    expect(rowTitles()).toEqual([
      'Nhóm chạy bộ Hồ Tây',
      'Trần Minh Anh',
      'Gia đình',
      'Phòng khám Ánh Dương',
      'Lê Hoàng',
      'Thu Trang',
      'Điện lực Hà Nội',
    ])

    const contract = within(row(/Trần Minh Anh/))
    expect(contract.getByText('Hợp đồng thuê văn phòng — bản sửa lần 2')).toBeInTheDocument()
    expect(contract.getByText('09:41')).toBeInTheDocument()
    expect(contract.getByText('Task · hạn T4 07/10')).toBeInTheDocument()
    const family = within(row(/Gia đình/))
    expect(family.getByText('Zalo · nhóm 6 người')).toBeInTheDocument()
    expect(family.getByText('Hà: Con mua bánh bông lan trứng muối được không mẹ?')).toBeInTheDocument()
    expect(family.getByText('3')).toBeInTheDocument()
    expect(within(row(/Nhóm chạy bộ/)).getByText('Hiện lại theo hẹn · 14:00')).toBeInTheDocument()
    expect(within(row(/Nhóm chạy bộ/)).getByText('Hôm qua')).toBeInTheDocument()
    expect(within(row(/Lê Hoàng/)).getByText('Thư hẹn giờ không gửi được')).toBeInTheDocument()
    expect(within(row(/Điện lực/)).getByText('Thứ 3')).toBeInTheDocument()
  })

  it('counts each source and quick filter, and lists the accounts', async () => {
    open('/inbox')

    expect(await sources().findByRole('link', { name: /Tất cả/ })).toHaveAttribute('aria-current', 'page')
    expect(sources().getByRole('link', { name: /Tất cả/ })).toHaveTextContent('12')
    expect(sources().getByRole('link', { name: /Gmail/ })).toHaveTextContent('7')
    expect(sources().getByRole('link', { name: /Zalo/ })).toHaveTextContent('4')
    expect(sources().getByRole('link', { name: /Messenger/ })).toHaveTextContent('cần đăng nhập lại')
    expect(sources().getByRole('link', { name: /Cần trả lời/ })).toHaveTextContent('3')
    expect(sources().getByRole('link', { name: /Có tệp/ })).toHaveTextContent('5')
    expect(sources().getByRole('link', { name: /Đã hẹn giờ/ })).toHaveTextContent('1')
    expect(sources().getByRole('link', { name: /Đang tạm ẩn/ })).toHaveTextContent('1')
    expect(sources().getByRole('link', { name: /an\.nguyen@gmail\.com/ })).toHaveAttribute('href', '/accounts/acc-gmail')
    expect(sources().getByRole('link', { name: /\+84 9•• ••• 218/ })).toHaveTextContent('64%')
    expect(sources().getByRole('link', { name: 'Thêm nguồn' })).toHaveAttribute('href', '/accounts?connect=new')
  })

  it('filters by source and by quick filter, keeping the choice in the address', async () => {
    const { router } = open('/inbox')
    const user = userEvent.setup()

    await user.click(await sources().findByRole('link', { name: /Zalo/ }))
    expect(router.state.location.search).toBe('?source=zalo')
    expect(rowTitles()).toEqual(['Nhóm chạy bộ Hồ Tây', 'Gia đình'])
    expect(list().getByText('4 chưa đọc')).toBeInTheDocument()
    expect(sources().getByRole('link', { name: /Zalo/ })).toHaveAttribute('aria-current', 'page')

    const views = within(list().getByRole('group', { name: 'Lọc danh sách' }))
    await user.click(views.getByRole('button', { name: 'Chưa đọc' }))
    expect(router.state.location.search).toBe('?source=zalo&view=unread')
    expect(rowTitles()).toEqual(['Gia đình'])
    expect(views.getByRole('button', { name: 'Chưa đọc' })).toHaveAttribute('aria-pressed', 'true')
    expect(sources().getByRole('link', { name: /Chưa đọc/ })).toHaveAttribute('aria-current', 'page')

    await user.click(sources().getByRole('link', { name: /Đã hẹn giờ/ }))
    expect(router.state.location.search).toBe('?source=zalo&view=scheduled')
    expect(list().getByText('Không có cuộc trò chuyện nào')).toBeInTheDocument()

    await user.click(sources().getByRole('link', { name: /Tất cả/ }))
    await user.click(sources().getByRole('link', { name: /Đang tạm ẩn/ }))
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

  it('marks an email as read when it opens, everywhere unread messages are counted', async () => {
    open('/inbox')
    const user = userEvent.setup()
    expect(within(await list().findByRole('link', { name: /Phòng khám/ })).getByLabelText('Chưa đọc')).toBeInTheDocument()

    await user.click(row(/Phòng khám/))

    expect(await list().findByText('11 chưa đọc')).toBeInTheDocument()
    expect(sources().getByRole('link', { name: /Gmail/ })).toHaveTextContent('6')
    expect(within(row(/Phòng khám/)).queryByLabelText('Chưa đọc')).toBeNull()
    expect(within(shellPart('sidebar')).getByRole('link', { name: /Hộp thư/ })).toHaveTextContent('11')
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
      'Đánh dấu chưa đọc',
      'Lưu trữ',
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
    expect(rowTitles()).toHaveLength(7)
  })
})
