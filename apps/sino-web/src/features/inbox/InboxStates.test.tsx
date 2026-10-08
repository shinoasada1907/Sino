import { onlineManager } from '@tanstack/react-query'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import { fetchConversation, fetchInbox, sendMessage } from './inbox.api'
import { createConversationSample, createInboxSample } from './inbox.sample'
import type { InboxData } from './inbox.types'

vi.mock('./inbox.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./inbox.api')>()
  return {
    ...api,
    fetchInbox: vi.fn(api.fetchInbox),
    fetchConversation: vi.fn(api.fetchConversation),
    sendMessage: vi.fn(api.sendMessage),
  }
})

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')
const NO_COUNTS: InboxData['counts'] = { unread: 0, byProvider: [], needsReply: 0, withAttachments: 0, scheduled: 0, snoozed: 0 }

function open(path: string, inbox: InboxData | null = createInboxSample(NOW)) {
  return renderApp(path, { shell: createShellSample(NOW), inbox })
}

const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
const chat = (title: string) => within(screen.getByRole('region', { name: `Cuộc trò chuyện ${title}` }))

describe('states of the inbox', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    onlineManager.setOnline(true)
  })

  it('shows the shape of the list while the inbox loads', async () => {
    vi.mocked(fetchInbox).mockReturnValueOnce(new Promise(() => {}))
    open('/inbox', null)

    expect(await screen.findByRole('status', { name: 'Đang tải hộp thư' })).toBeInTheDocument()
    expect(list().getByText('đang tải')).toBeInTheDocument()
    expect(list().queryAllByRole('link')).toHaveLength(0)
  })

  it('shows the first sync of an account while nothing has arrived yet', async () => {
    const sample = createInboxSample(NOW)
    const gmail = { ...sample.accounts[0], syncProgress: 35 }
    open('/inbox', { ...sample, accounts: [gmail], conversations: [], counts: NO_COUNTS })

    const card = await list().findByRole('status', { name: 'Đồng bộ lần đầu · Gmail' })
    expect(card).toHaveTextContent('35%')
    expect(within(card).getByRole('img', { name: 'Đã đồng bộ 35%' })).toBeInTheDocument()
    expect(list().getByText('đang đồng bộ')).toBeInTheDocument()
    expect(list().queryByText('Không có cuộc trò chuyện nào')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Lọc danh sách' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Nguồn' })).toBeNull()
    expect(thread().queryByText('Chọn một cuộc trò chuyện để đọc.')).toBeNull()
  })

  it('asks to connect a source when there is none', async () => {
    const sample = createInboxSample(NOW)
    open('/inbox', { ...sample, accounts: [], conversations: [], counts: NO_COUNTS })

    expect(await screen.findByRole('heading', { level: 1, name: 'Hộp thư đang trống.' })).toBeInTheDocument()
    for (const provider of ['Gmail', 'Zalo', 'Messenger']) {
      expect(screen.getByRole('link', { name: `Kết nối ${provider}` })).toHaveAttribute('href', '/accounts?connect=new')
    }
    expect(screen.queryByRole('region', { name: 'Danh sách cuộc trò chuyện' })).toBeNull()
  })

  it('says so when the inbox cannot load, and loads it again on "Thử lại"', async () => {
    vi.mocked(fetchInbox).mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ERR_TIMEOUT', requestId: '7f3a-91c2' }))
    open('/inbox', null)
    const user = userEvent.setup()

    const alert = await list().findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'Không tải được hộp thư' })).toBeInTheDocument()
    expect(alert).toHaveTextContent('ERR_TIMEOUT · yêu cầu 7f3a-91c2 · 14:05')
    expect(within(alert).getByRole('button', { name: 'Trạng thái hệ thống' })).toBeInTheDocument()
    expect(list().getByText('không tải được')).toBeInTheDocument()
    expect(thread().getByText('Nội dung sẽ hiện ở đây khi hộp thư tải xong.')).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await list().findByRole('link', { name: /Trần Minh Anh/ })).toBeInTheDocument()
    expect(list().queryByRole('alert')).toBeNull()
  })

  it('keeps the saved inbox while offline, and sends what was written once back online', async () => {
    open('/inbox/conv-2')
    const user = userEvent.setup()
    const box = await chat('Gia đình').findByRole('textbox', { name: 'Nhắn tin tới Gia đình' })
    await chat('Gia đình').findByText('Để con mang thêm trái cây nữa nhé.')

    act(() => onlineManager.setOnline(false))

    const banner = screen.getByText('Bạn đang ngoại tuyến.').closest('[role="status"]')!
    expect(banner).toHaveTextContent('Đang hiện dữ liệu đã lưu lúc 14:05. Thư bạn soạn sẽ gửi khi có mạng.')
    expect(within(banner as HTMLElement).getByRole('button', { name: 'Thử kết nối lại' })).toBeInTheDocument()
    expect(list().getByText('9 chưa đọc · đã lưu')).toBeInTheDocument()
    expect(chat('Gia đình').getByText('Sẽ gửi khi có mạng')).toBeInTheDocument()

    await user.type(box, 'Con về lúc 6 giờ')
    await user.click(chat('Gia đình').getByRole('button', { name: 'Xếp hàng gửi' }))

    expect(chat('Gia đình').getByText('Con về lúc 6 giờ')).toBeInTheDocument()
    expect(chat('Gia đình').getByText('14:05 · Đang gửi')).toBeInTheDocument()
    expect(sendMessage).not.toHaveBeenCalled()

    // jsdom says the browser is online, so asking again brings the app back online.
    await user.click(within(banner as HTMLElement).getByRole('button', { name: 'Thử kết nối lại' }))

    expect(await chat('Gia đình').findByText('14:05 · Đã gửi')).toBeInTheDocument()
    expect(sendMessage).toHaveBeenCalledWith('conv-2', 'Con về lúc 6 giờ')
    expect(screen.queryByText('Bạn đang ngoại tuyến.')).toBeNull()
  })

  it('replaces the message box with a way to sign in again when the account access expired', async () => {
    open('/inbox/conv-4')

    const alert = await chat('Lê Hoàng').findByRole('alert')
    expect(alert).toHaveTextContent('Cần đăng nhập lại Messenger để nhận và gửi tin')
    expect(alert).toHaveTextContent('Quyền truy cập đã hết hạn. Tin cũ vẫn đọc được ở đây.')
    expect(within(alert).getByRole('link', { name: 'Kết nối lại' })).toHaveAttribute('href', '/accounts?reconnect=acc-messenger')
    expect(chat('Lê Hoàng').queryByRole('textbox')).toBeNull()
    expect(chat('Lê Hoàng').getByText('Ngắt kết nối từ 21:04 hôm qua')).toBeInTheDocument()
    expect(await chat('Lê Hoàng').findByText('Tin nhắn sau 21:04 chưa về Sino')).toBeInTheDocument()
  })

  it('says when only the permission to send has expired', async () => {
    vi.mocked(fetchConversation).mockImplementation(async (id) => ({ ...createConversationSample(id, NOW), canSend: false }))
    open('/inbox/conv-1')

    const notice = await thread().findByText('Quyền gửi thư của an.nguyen@gmail.com đã hết hạn')
    const box = notice.closest('[role="status"]') as HTMLElement
    expect(box).toHaveTextContent('Bạn vẫn đọc thư bình thường. Cấp lại riêng quyền gửi để trả lời từ Sino.')
    expect(within(box).getByRole('button', { name: 'Trả lời trong Gmail' })).toBeInTheDocument()
    expect(within(box).getByRole('link', { name: 'Cấp lại quyền gửi' })).toHaveAttribute('href', '/accounts?reconnect=acc-gmail')
    expect(thread().queryByRole('textbox', { name: 'Trả lời Trần Minh Anh' })).toBeNull()
  })
})
