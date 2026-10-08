import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import { createInboxSample } from './inbox.sample'

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
}

const chat = (title: string) => within(screen.getByRole('region', { name: `Cuộc trò chuyện ${title}` }))
const info = () => within(screen.getByRole('complementary', { name: 'Thông tin cuộc trò chuyện' }))
const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))

describe('a chat conversation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heads the page with the group and a way back to the inbox', async () => {
    open('/inbox/conv-2?view=unread')
    const family = chat('Gia đình')

    expect(await family.findByRole('heading', { level: 1, name: 'Gia đình' })).toBeInTheDocument()
    expect(family.getByText('Zalo · nhóm 6 người · qua +84 9•• ••• 218')).toBeInTheDocument()
    expect(family.getByRole('link', { name: 'Hộp thư' })).toHaveAttribute('href', '/inbox?view=unread')
    expect(family.getByRole('button', { name: 'Mở trong Zalo' })).toBeInTheDocument()
  })

  it('shows the messages by day, the system line, the unread line and the state of own messages', async () => {
    open('/inbox/conv-2')
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

  it('lists the linked items, members, files and account in the info column', async () => {
    open('/inbox/conv-2')
    const user = userEvent.setup()

    expect(await info().findByRole('link', { name: /Mua bánh bông lan trứng muối cho bà/ })).toHaveTextContent(
      'TASK · T7 03/10 17:00 · NHẮC 18:00 HÔM NAY',
    )
    expect(info().getByRole('link', { name: /Về nhà ăn cơm/ })).toHaveTextContent('LỊCH HẸN · T7 03/10 18:30')
    expect(info().getByRole('link', { name: /Danh sách mua cho bà/ })).toHaveTextContent('GHI CHÚ · ĐÃ GHIM')
    expect(info().getByText('Trưởng nhóm')).toBeInTheDocument()
    expect(info().getByText('mới')).toBeInTheDocument()
    expect(info().queryByText('Ông ngoại')).toBeNull()
    await user.click(info().getByRole('button', { name: 'Xem thêm 1 người' }))
    expect(info().getByText('Ông ngoại')).toBeInTheDocument()
    expect(info().getByRole('img', { name: '6 ảnh gần nhất' })).toBeInTheDocument()
    expect(info().getByText('Lich-trinh-ve-que.docx')).toBeInTheDocument()
    expect(info().getByText('24 KB · 27/09')).toBeInTheDocument()
    expect(info().getByRole('link', { name: /\+84 9•• ••• 218/ })).toHaveAttribute('href', '/accounts/acc-zalo')
    expect(info().getByRole('switch', { name: 'Tắt thông báo nhóm này' })).not.toBeChecked()
    expect(info().getByRole('switch', { name: 'Hiện trong Tổng quan' })).toBeChecked()
  })

  it('counts the sections it has, and leaves out the ones the backend has nothing for', async () => {
    open('/inbox/conv-4')

    expect(await chat('Lê Hoàng').findByText('Bản thiết kế cuối cậu xem chưa?')).toBeInTheDocument()
    expect(chat('Lê Hoàng').queryByText('Lê Hoàng', { selector: '[data-slot="bubble-name"]' })).toBeNull()
    expect(info().queryByText('Thành viên')).toBeNull()
    expect(info().queryByText('Ảnh và tệp')).toBeNull()
    expect(info().getByText('Tài khoản dùng')).toBeInTheDocument()
  })

  it('reads the conversation, so the inbox counts three unread messages less', async () => {
    open('/inbox')
    const user = userEvent.setup()

    await user.click(await list().findByRole('link', { name: /Gia đình/ }))
    expect(await chat('Gia đình').findByText('3 tin chưa đọc')).toBeInTheDocument()
    await user.click(chat('Gia đình').getByRole('link', { name: 'Hộp thư' }))

    expect(await list().findByText('9 chưa đọc')).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Nguồn và bộ lọc' })).getByRole('link', { name: /Zalo/ })).toHaveTextContent('1')
    expect(within(list().getByRole('link', { name: /Gia đình/ })).queryByText('tin chưa đọc', { exact: false })).toBeNull()
  })
})
