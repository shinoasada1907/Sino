import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import { createInboxSample } from './inbox.sample'

vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const open = (path: string) => renderApp(path, { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
const tabs = async () => within(await screen.findByRole('group', { name: 'Lọc danh sách' }))

describe('the filters of Tin nhắn (MA-06, D-435, D-436)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('has three tabs; a tab with something in it has a dot, and its number is in its name', async () => {
    open('/messages')
    const group = await tabs()

    expect(group.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true')
    const unread = group.getByRole('button', { name: /^Chưa đọc, \d+ chưa xử lý$/ })
    expect(unread.querySelector('.bg-danger')).not.toBeNull()
    expect(group.getByRole('button', { name: 'Tất cả' }).querySelector('.bg-danger')).toBeNull()
  })

  it('puts the tab in the address', async () => {
    const { router } = open('/messages')
    const group = await tabs()

    await userEvent.setup().click(group.getByRole('button', { name: /^Chưa đọc/ }))

    expect(router.state.location.search).toBe('?view=unread')
    expect((await tabs()).getByRole('button', { name: /^Chưa đọc/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the other views in "Thêm", which then names the chosen one and leaves every tab unpressed', async () => {
    const { router } = open('/messages')
    const user = userEvent.setup()
    await tabs()

    await user.click(screen.getByRole('button', { name: 'Thêm' }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Có tệp' }))

    expect(router.state.location.search).toBe('?view=attachments')
    expect(screen.getByRole('button', { name: 'Có tệp' })).toHaveAttribute('aria-pressed', 'true')
    for (const tab of (await tabs()).getAllByRole('button')) {
      expect(tab).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('filters by Cá nhân and Nhóm in the address, and Mọi chat clears it', async () => {
    const { router } = open('/messages')
    const user = userEvent.setup()
    await tabs()
    const chips = () => within(screen.getByRole('group', { name: 'Loại chat' }))

    expect(chips().getByRole('button', { name: 'Mọi chat' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(chips().getByRole('button', { name: 'Nhóm' }))
    expect(router.state.location.search).toBe('?chat=group')
    expect(chips().getByRole('button', { name: 'Nhóm' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(chips().getByRole('button', { name: 'Cá nhân' }))
    expect(router.state.location.search).toBe('?chat=direct')
    await user.click(chips().getByRole('button', { name: 'Mọi chat' }))
    expect(router.state.location.search).toBe('')
  })

  it('has no chips of chat type in Hộp thư, but the same tabs with dots', async () => {
    open('/inbox')
    const group = await tabs()

    expect(screen.queryByRole('group', { name: 'Loại chat' })).toBeNull()
    expect(group.getByRole('button', { name: /^Cần trả lời, \d+ chưa xử lý$/ })).toBeInTheDocument()
  })

  it('opens the info of a chat over it with "Thông tin", and Esc closes it', async () => {
    open('/messages/conv-2')
    const user = userEvent.setup()

    expect(screen.queryByRole('complementary', { name: 'Thông tin cuộc trò chuyện' })).toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Thông tin' }))
    expect(await screen.findByRole('complementary', { name: 'Thông tin cuộc trò chuyện' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Thông tin cuộc trò chuyện' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Cuộc trò chuyện Gia đình' })).toBeInTheDocument()
  })
})
