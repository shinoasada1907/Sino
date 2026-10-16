import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createInboxSample } from './inbox.sample'

// Tin nhắn and Hộp thư (f05c, D-300…D-304) on the sample contract.
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string, inbox: ReturnType<typeof createInboxSample> | null = createInboxSample(NOW)) {
  return renderApp(path, { shell: createShellSample(NOW), inbox })
}

const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
const sources = () => within(screen.getByRole('complementary', { name: 'Nguồn và bộ lọc' }))
const rowTitles = () =>
  list()
    .queryAllByRole('link')
    .flatMap((link) => link.querySelector('[data-slot="row-title"]')?.textContent ?? [])

describe('Tin nhắn and Hộp thư (f05c)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists only the chats at /messages, with the counts of Tin nhắn', async () => {
    open('/messages')

    expect(await list().findByRole('heading', { level: 1, name: 'Tin nhắn' })).toBeInTheDocument()
    expect(list().getByText('5 chưa đọc')).toBeInTheDocument()
    expect(rowTitles()).toEqual(['Nhóm chạy bộ Hồ Tây', 'Gia đình', 'Hà', 'Lê Hoàng', 'Nhóm sửa nhà'])
  })

  it('lists only the emails at /inbox, with the counts of Hộp thư', async () => {
    open('/inbox')

    expect(await list().findByRole('heading', { level: 1, name: 'Hộp thư' })).toBeInTheDocument()
    expect(list().getByText('7 chưa đọc')).toBeInTheDocument()
    expect(rowTitles()).toEqual(['Trần Minh Anh', 'Phòng khám Ánh Dương', 'Thu Trang', 'Điện lực Hà Nội'])
  })

  it('asks for the frame and the list of its own kind', async () => {
    open('/messages', null)

    expect(await list().findByText('Nhóm sửa nhà')).toBeInTheDocument()
    expect(api.fetchInbox).toHaveBeenCalledWith('CHAT')
    expect(api.fetchConversations).toHaveBeenCalledWith({ view: 'all', source: null }, null, 'CHAT')
    expect(list().getByText('5 chưa đọc')).toBeInTheDocument()
    expect(rowTitles()).not.toContain('Trần Minh Anh')
  })

  it('offers only the chat sources, and drops an email source from the address', async () => {
    const { router } = open('/messages?source=gmail&view=unread')

    expect(await sources().findByRole('link', { name: /^Zalo/ })).toBeInTheDocument()
    expect(sources().getByRole('link', { name: /^Messenger/ })).toBeInTheDocument()
    expect(sources().queryByRole('link', { name: /^Gmail/ })).toBeNull()
    expect(sources().getByRole('link', { name: /^Tất cả/ })).toHaveAttribute('aria-current', 'page')
    expect(sources().getByRole('link', { name: /^Chưa đọc/ })).toHaveAttribute('aria-current', 'page')
    expect(router.state.location.pathname).toBe('/messages')
  })

  it('has no Thư mới on Tin nhắn', async () => {
    open('/messages')

    await list().findByRole('heading', { level: 1, name: 'Tin nhắn' })
    expect(screen.queryByRole('link', { name: 'Thư mới' })).toBeNull()
  })

  it('opens a chat under /messages, with Tin nhắn as its way back', async () => {
    open('/messages/conv-2?source=zalo')

    expect(await screen.findByRole('region', { name: 'Cuộc trò chuyện Gia đình' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tin nhắn' })).toHaveAttribute('href', '/messages?source=zalo')
    expect(screen.getByRole('link', { name: 'Quay lại Tin nhắn' })).toHaveAttribute('href', '/messages?source=zalo')
  })

  it('moves an old link of a chat to Tin nhắn without a step in the history, and reads it once there', async () => {
    const { router } = open('/overview')
    await router.navigate('/inbox/conv-2')

    await waitFor(() => expect(router.state.location.pathname).toBe('/messages/conv-2'))
    expect(await screen.findByRole('region', { name: 'Cuộc trò chuyện Gia đình' })).toBeInTheDocument()
    await waitFor(() => expect(api.updateConversation).toHaveBeenCalledWith('conv-2', { read: true }))
    expect(api.updateConversation).toHaveBeenCalledTimes(1)

    await router.navigate(-1)
    expect(router.state.location.pathname).toBe('/overview')
  })

  it('asks to connect a chat account while Tin nhắn has none, one line per chat provider (D-305)', async () => {
    const sample = createInboxSample(NOW)
    open('/messages', { ...sample, accounts: sample.accounts.filter((account) => account.provider === 'gmail'), conversations: [] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Tin nhắn đang trống.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kết nối Zalo' })).toHaveAttribute('href', '/accounts?connect=new')
    expect(screen.getByRole('link', { name: 'Kết nối Messenger' })).toHaveAttribute('href', '/accounts?connect=new')
    expect(screen.queryByRole('link', { name: 'Kết nối Gmail' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Danh sách cuộc trò chuyện' })).toBeNull()
  })

  it('offers one way to connect when the catalog has no chat provider yet', async () => {
    const sample = createInboxSample(NOW)
    open('/messages', {
      ...sample,
      providers: sample.providers.filter((provider) => provider.kind === 'EMAIL'),
      accounts: sample.accounts.filter((account) => account.provider === 'gmail'),
      conversations: [],
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Tin nhắn đang trống.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kết nối tài khoản' })).toHaveAttribute('href', '/accounts?connect=new')
  })

  it('asks for an email account on Hộp thư even when chats are connected', async () => {
    const sample = createInboxSample(NOW)
    open('/inbox', { ...sample, accounts: sample.accounts.filter((account) => account.provider !== 'gmail'), conversations: [] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Hộp thư đang trống.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kết nối Gmail' })).toHaveAttribute('href', '/accounts?connect=new')
    expect(screen.queryByRole('link', { name: 'Kết nối Zalo' })).toBeNull()
  })

  it('moves an email opened under /messages to Hộp thư, dropping the filter of Tin nhắn', async () => {
    const { router } = open('/messages/conv-1?view=unread')

    await waitFor(() => expect(router.state.location.pathname).toBe('/inbox/conv-1'))
    expect(router.state.location.search).toBe('')
    expect(await screen.findByRole('heading', { name: 'Hợp đồng thuê văn phòng — bản sửa lần 2' })).toBeInTheDocument()
  })
})
