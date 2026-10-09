import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS } from '@/test/fixtures/inboxApi'
import { lastStream } from '@/test/eventSource'
import { server } from '@/test/msw/server'
import { renderApp, shellPart } from '@/test/renderApp'

type Item = (typeof API_CONVERSATIONS)[number]

/** The inbox API over conversations a test can change, as new mail would. */
function backend() {
  const state: Item[] = API_CONVERSATIONS.map((item) => ({ ...item }))
  const unread = () => state.filter((item) => !item.archived && item.unreadCount > 0).length
  let listReads = 0
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/conversations/counts', () =>
      HttpResponse.json({ unread: unread(), byProvider: { gmail: unread() }, needsReply: 0, withAttachments: 0, scheduled: 0, snoozed: 0 }),
    ),
    http.get('/api/conversations', () => {
      listReads += 1
      return HttpResponse.json({ items: state.filter((item) => !item.archived), nextCursor: null })
    }),
  )
  const arrive = (id: string, title: string) =>
    state.unshift({ ...API_CONVERSATIONS[0], id, title, subject: `Thư của ${title}`, lastMessageAt: '2026-10-02T07:04:00Z', unreadCount: 1 })
  return { state, unread, arrive, listReads: () => listReads }
}

const event = (source: string, newInbound: number) => ({
  type: 'conversations.changed',
  accountId: 'acc-1',
  conversationIds: ['n-1'],
  newInbound,
  source,
  at: '2026-10-02T07:04:30Z',
})
const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
const row = (title: string) => list().getByRole('link', { name: new RegExp(title) })

describe('the inbox while mail arrives (FE-54)', () => {
  it('slides in what arrives at the top, says "N thư mới" for mail from sync, and the inbox count follows', async () => {
    const api = backend()
    renderApp('/inbox', { inbox: null })
    const user = userEvent.setup()
    await list().findByRole('link', { name: /Trần Minh Anh/ })
    const before = api.unread()
    const sidebar = within(shellPart('sidebar'))
    expect(await sidebar.findByRole('link', { name: `Hộp thư, ${before} chưa đọc` })).toBeInTheDocument()

    api.arrive('n-1', 'Ngân hàng Á Châu')
    api.arrive('n-2', 'Lê Hoàng')
    lastStream().open()
    lastStream().emit('conversations.changed', event('sync', 2))

    expect(await list().findByRole('link', { name: /Lê Hoàng/ })).toHaveAttribute('data-arrived', 'slide')
    expect(row('Ngân hàng Á Châu')).toHaveAttribute('data-arrived', 'slide')
    expect(row('Trần Minh Anh')).not.toHaveAttribute('data-arrived')
    expect(await sidebar.findByRole('link', { name: `Hộp thư, ${before + 2} chưa đọc` })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '2 thư mới' }))
    expect(screen.queryByRole('button', { name: '2 thư mới' })).toBeNull()
  })

  it('reads the list again after a change made by the user, without a notice', async () => {
    const api = backend()
    renderApp('/inbox', { inbox: null })
    await list().findByRole('link', { name: /Trần Minh Anh/ })
    const reads = api.listReads()

    api.state[0].unreadCount = 0
    lastStream().open()
    lastStream().emit('conversations.changed', event('user', 0))

    await vi.waitFor(() => expect(api.listReads()).toBe(reads + 1))
    expect(screen.queryByRole('button', { name: /thư mới/ })).toBeNull()
  })

  it('says new mail may come late while the stream stays down for 30 s (FE-55, D-94)', () => {
    // Opening again reads the inbox again, so the API answers too.
    backend()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderApp('/inbox')
      act(() => lastStream().open())
      act(() => lastStream().drop())
      act(() => vi.advanceTimersByTime(29_000))
      expect(screen.queryByText(/Thư mới có thể về chậm/)).toBeNull()

      act(() => vi.advanceTimersByTime(1_000))
      expect(screen.getAllByRole('status').map((status) => status.textContent)).toContain('Thư mới có thể về chậm · đang kết nối lại…')

      act(() => lastStream().open())
      expect(screen.queryByText(/Thư mới có thể về chậm/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
