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

const chat = (title: string) => within(screen.getByRole('region', { name: `Cuộc trò chuyện ${title}` }))
const info = () => within(screen.getByRole('complementary', { name: 'Thông tin cuộc trò chuyện' }))
const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
// The header of the list (title, count, view buttons) sits above the scrolling rows, in the same column.
const pane = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }).parentElement as HTMLElement)

describe('a chat conversation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heads the page with the group and a way back to Tin nhắn (f05c)', async () => {
    open('/messages/conv-2?view=unread')
    const family = chat('Gia đình')

    expect(await family.findByRole('heading', { level: 1, name: 'Gia đình' })).toBeInTheDocument()
    expect(family.getByText('Zalo · nhóm 6 người · qua +84 9•• ••• 218')).toBeInTheDocument()
    expect(family.getByRole('link', { name: 'Tin nhắn' })).toHaveAttribute('href', '/messages?view=unread')
    expect(family.getByRole('button', { name: 'Mở trong Zalo' })).toBeInTheDocument()
  })

  it('shows the messages by day, the system line, the unread line and the state of own messages', async () => {
    open('/messages/conv-2')
    const family = chat('Gia đình')

    expect(await family.findByText('Tuần sau ông bà lên chơi, mấy đứa sắp xếp về nhé.')).toBeInTheDocument()
    expect(family.getByText('HÔM QUA')).toBeInTheDocument()
    expect(family.getByText('HÔM NAY')).toBeInTheDocument()
    expect(family.getByText('Bố')).toBeInTheDocument()
    expect(family.getByText('20:15')).toBeInTheDocument()
    expect(family.getByText('20:31 · Đã xem')).toBeInTheDocument()
    expect(family.getByText('Mẹ đã thêm Hà vào nhóm')).toBeInTheDocument()
    const unreadLine = family.getByText('3 tin chưa đọc')
    const before = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(family.getByText('Mẹ đã thêm Hà vào nhóm'), unreadLine)).toBe(true)
    expect(before(unreadLine, family.getByText('Cuối tuần này cả nhà về ăn cơm nhé, nhớ mua bánh cho bà.'))).toBe(true)
    expect(family.getByText('Ảnh · thực đơn cuối tuần · 1,2 MB')).toBeInTheDocument()
    expect(family.getByRole('link', { name: 'Task: Mua bánh bông lan trứng muối cho bà' })).toHaveAttribute('href', '/tasks')
    expect(family.getByText('Để con mang thêm trái cây nữa nhé.')).toBeInTheDocument()
    expect(family.getByText('08:24 · Đang gửi')).toBeInTheDocument()
    expect(family.getByRole('textbox', { name: 'Nhắn tin tới Gia đình' })).toBeInTheDocument()
    expect(family.getByText('Gửi qua Zalo · +84 9•• ••• 218')).toBeInTheDocument()
  })

  // The info column is the profile card of chat-ui-refactor: who, three buttons, push switch, then the files of the chat.
  it('shows the profile card and the files of the chat in the info column', async () => {
    open('/messages/conv-2')

    expect(await info().findByRole('heading', { level: 3, name: 'Gia đình' })).toBeInTheDocument()
    expect(info().getByRole('button', { name: 'Hồ sơ' })).toBeInTheDocument()
    expect(info().getByRole('button', { name: 'Tắt tiếng' })).toBeInTheDocument()
    expect(info().getByRole('switch')).toBeChecked()
    expect(info().getByText('Lich-trinh-ve-que.docx')).toBeInTheDocument()
    expect(info().getByText(/^TỆP TÀI LIỆU \(/)).toBeInTheDocument()
  })

  it('mutes from the profile card', async () => {
    open('/messages/conv-2')
    const user = userEvent.setup()

    await user.click(await info().findByRole('button', { name: 'Tắt tiếng' }))

    expect(info().getByRole('button', { name: 'Bật tiếng' })).toBeInTheDocument()
  })

  it('leaves out the sections the backend has nothing for', async () => {
    open('/messages/conv-4')

    expect(await chat('Lê Hoàng').findByText('Bản thiết kế cuối cậu xem chưa?')).toBeInTheDocument()
    expect(chat('Lê Hoàng').queryByText('Lê Hoàng', { selector: '[data-slot="bubble-name"]' })).toBeNull()
    expect(info().queryByText(/^TỆP TÀI LIỆU/)).toBeNull()
    expect(info().queryByText(/^ẢNH & VIDEO/)).toBeNull()
    expect(info().getByRole('heading', { level: 3, name: 'Lê Hoàng' })).toBeInTheDocument()
  })

  it('reads the conversation, so Tin nhắn counts one unread conversation less (D-70)', async () => {
    open('/messages')
    const user = userEvent.setup()

    await user.click(await list().findByRole('link', { name: /Gia đình/ }))
    expect(await chat('Gia đình').findByText('3 tin chưa đọc')).toBeInTheDocument()
    await user.click(chat('Gia đình').getByRole('link', { name: 'Tin nhắn' }))

    expect(await pane().findAllByText('4 chưa đọc')).not.toHaveLength(0)
    expect(within(screen.getByRole('group', { name: 'Tài khoản' })).getByRole('button', { name: '+84 9•• ••• 218 · 3' })).toBeInTheDocument()
    expect(within(list().getByRole('link', { name: /Gia đình/ })).queryByText('tin chưa đọc', { exact: false })).toBeNull()
  })
})
