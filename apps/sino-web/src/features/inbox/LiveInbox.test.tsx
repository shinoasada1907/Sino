import type { QueryClient } from '@tanstack/react-query'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS, apiInitialSync } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_MESSAGES, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
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
    // The shell keeps the account list on every screen (NS-01): a stream that opens again reads it, with the imports, again.
    http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(apiInitialSync())),
    http.get('/api/conversations/counts', () =>
      HttpResponse.json({ unread: unread(), byProvider: { gmail: unread() }, byAccount: {}, needsReply: 0, withAttachments: 0, scheduled: 0, snoozed: 0 }),
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

  it('says new mail may come late while the stream stays down for 30 s (FE-55, D-94)', async () => {
    // Opening again reads the inbox again, so the API answers too.
    backend()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let queryClient: QueryClient | undefined
    try {
      queryClient = renderApp('/inbox').queryClient
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
    // The accounts are read again too (NS-01): leave no request in flight, or it lands in the next test and finds no handler.
    await vi.waitFor(() => expect(queryClient?.isFetching()).toBe(0))
  })
})

describe('the notice of each screen (f05c)', () => {
  // A Zalo account beside the Gmail ones; the list answers by kind, as the API does since f05c.
  function twoKinds() {
    const chat = { ...API_CONVERSATIONS[0], id: 'z-1', accountId: 'acc-zalo', accountIds: ['acc-zalo'], provider: 'zalo', kind: 'CHAT', title: 'Gia đình', subject: null }
    server.use(
      http.get('/api/accounts', () => HttpResponse.json([...API_ACCOUNTS, { ...API_ACCOUNTS[0], id: 'acc-zalo', provider: 'zalo', address: '+84 9•• ••• 218' }])),
      http.get('/api/providers', () => HttpResponse.json([...API_PROVIDERS, { type: 'zalo', displayName: 'Zalo', kind: 'CHAT', capabilities: ['READ_MESSAGES'] }])),
      http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(apiInitialSync())),
      http.get('/api/conversations/counts', () =>
        HttpResponse.json({ unread: 1, byProvider: {}, byAccount: {}, needsReply: 0, withAttachments: 0, scheduled: 0, snoozed: 0, unreadByKind: { EMAIL: 1, CHAT: 1 } }),
      ),
      http.get('/api/conversations', ({ request }) =>
        HttpResponse.json({ items: new URL(request.url).searchParams.get('kind') === 'chat' ? [chat] : API_CONVERSATIONS, nextCursor: null }),
      ),
    )
  }

  it('says "N tin mới" on Tin nhắn for new chats, and nothing for new mail', async () => {
    twoKinds()
    renderApp('/messages', { inbox: null })
    await list().findByRole('link', { name: /Gia đình/ })
    lastStream().open()

    lastStream().emit('conversations.changed', event('sync', 2))
    lastStream().emit('conversations.changed', { ...event('sync', 1), accountId: 'acc-zalo' })

    expect(await list().findByRole('button', { name: '1 tin mới' })).toBeInTheDocument()
    expect(list().queryByRole('button', { name: /thư mới/ })).toBeNull()
  })

  it('follows the account being viewed: mail of another account says nothing (messages-by-account, D-433)', async () => {
    twoKinds()
    renderApp('/inbox?account=acc-1', { inbox: null })
    await list().findByRole('link', { name: /Trần Minh Anh/ })
    lastStream().open()

    lastStream().emit('conversations.changed', { ...event('sync', 3), accountId: 'acc-2' })
    lastStream().emit('conversations.changed', event('sync', 1))

    expect(await list().findByRole('button', { name: '1 thư mới' })).toBeInTheDocument()
    expect(list().queryByRole('button', { name: /3 thư mới|4 thư mới/ })).toBeNull()
  })

  it('says nothing on Hộp thư for new chats', async () => {
    twoKinds()
    renderApp('/inbox', { inbox: null })
    await list().findByRole('link', { name: /Trần Minh Anh/ })
    lastStream().open()

    lastStream().emit('conversations.changed', { ...event('sync', 1), accountId: 'acc-zalo' })
    lastStream().emit('conversations.changed', event('sync', 2))

    expect(await list().findByRole('button', { name: '2 thư mới' })).toBeInTheDocument()
    expect(list().queryByRole('button', { name: /3 thư mới|tin mới/ })).toBeNull()
    // The list stays silent about the chats; the bell of the top bar, on every screen, tells them in its menu (NF-02).
    await userEvent.setup().click((await screen.findAllByRole('button', { name: /^Thông báo/ }))[0])
    expect(await screen.findByText('1 tin mới')).toBeInTheDocument()
  })
})

describe('reading an open conversation when a new message arrives', () => {
  function openBackend() {
    const state: Item[] = API_CONVERSATIONS.map((item) => ({ ...item }))
    const changes: [string, { read?: boolean; archived?: boolean }][] = []
    const unread = () => state.filter((item) => !item.archived && item.unreadCount > 0).length
    server.use(
      http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
      http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(apiInitialSync())),
      http.get('/api/conversations/counts', () =>
        HttpResponse.json({ unread: unread(), byProvider: { gmail: unread() }, byAccount: {}, needsReply: 0, withAttachments: 0, scheduled: 0, snoozed: 0 }),
      ),
      http.get('/api/conversations', () => HttpResponse.json({ items: state.filter((item) => !item.archived), nextCursor: null })),
      http.get('/api/conversations/:id', ({ params }) => {
        const found = state.find((entry) => entry.id === params.id)
        return found ? HttpResponse.json({ ...found, participants: API_PARTICIPANTS }) : HttpResponse.json({}, { status: 404 })
      }),
      http.get('/api/conversations/:id/messages', () => HttpResponse.json({ items: API_MESSAGES, nextCursor: null })),
      http.patch('/api/conversations/:id', async ({ params, request }) => {
        const body = (await request.json()) as { read?: boolean; archived?: boolean }
        changes.push([String(params.id), body])
        const found = state.find((entry) => entry.id === params.id)!
        if (body.read !== undefined) {
          found.unreadCount = body.read ? 0 : 1
        }
        return HttpResponse.json({ ...found })
      }),
    )
    return { state, changes }
  }

  it('marks the open conversation read again when a new message arrives over realtime', async () => {
    const { state, changes } = openBackend()
    renderApp('/inbox/c-1', { inbox: null })

    await vi.waitFor(() => expect(changes).toEqual([['c-1', { read: true }]]))
    expect(within(row('Trần Minh Anh')).queryByLabelText('Chưa đọc')).toBeNull()

    // A new inbound message lands in the open conversation: newer lastMessageAt and unreadCount > 0.
    state[0].lastMessageAt = '2026-10-02T07:05:00.000Z'
    state[0].unreadCount = 1
    lastStream().open()
    lastStream().emit('conversations.changed', { ...event('sync', 1), conversationIds: ['c-1'] })

    await vi.waitFor(() => expect(changes).toEqual([['c-1', { read: true }], ['c-1', { read: true }]]))
    await vi.waitFor(() => expect(within(row('Trần Minh Anh')).queryByLabelText('Chưa đọc')).toBeNull())
  })

  it('keeps an open conversation unread when the user marks it unread (even if it was already read)', async () => {
    const { changes } = openBackend()
    const { router } = renderApp('/inbox/c-2', { inbox: null })
    const user = userEvent.setup()

    const thread = within(await screen.findByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
    await user.click(await thread.findByRole('button', { name: 'Đánh dấu chưa đọc' }))

    expect(router.state.location.pathname).toBe('/inbox')
    expect(within(row('Ngân hàng ACB')).getByLabelText('Chưa đọc')).toBeInTheDocument()
    await vi.waitFor(() => expect(changes).toEqual([['c-2', { read: false }]]))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(changes).toEqual([['c-2', { read: false }]])
  })

  it('does not mark an open conversation read again when unreadCount rises without a newer lastMessageAt', async () => {
    const { state, changes } = openBackend()
    renderApp('/inbox/c-2', { inbox: null })
    await screen.findByRole('heading', { level: 2, name: 'Sao kê tháng 9' })

    // Marked unread from elsewhere (same lastMessageAt, no new message).
    state[1].unreadCount = 1
    lastStream().open()
    lastStream().emit('conversations.changed', { ...event('user', 0), conversationIds: ['c-2'] })

    expect(await within(row('Ngân hàng ACB')).findByLabelText('Chưa đọc')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(changes).toEqual([])
  })
})
