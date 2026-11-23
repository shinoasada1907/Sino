import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS, apiInitialSync } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_MESSAGES, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

function chatMessage(n: number, extra: Record<string, unknown> = {}) {
  const dayOffset = Math.floor((120 - n) / 50)
  const sentAt = new Date(Date.parse('2026-10-02T07:00:00Z') - dayOffset * 86_400_000 - (120 - n) * 60_000).toISOString()
  return {
    ...API_MESSAGES[0],
    id: `m-${n}`,
    direction: n % 2 === 0 ? 'OUTBOUND' : 'INBOUND',
    status: 'SENT',
    sentAt,
    sender: n % 2 === 0
      ? { name: 'Bạn', address: 'self', self: true }
      : { name: 'Nguyễn Thu Hà', address: 'ha', self: false },
    text: `Tin ${n}`,
    attachments: [],
    ...extra,
  }
}

interface RecordedRequest {
  id: string
  cursor: string | null
  limit: string | null
}

function setupBackend(options: { totalChatMessages?: number; chatPageCap?: number; failCursorOnce?: string; holdFirstPage?: Promise<void>; holdCursor?: Promise<void> } = {}) {
  const { totalChatMessages = 120, chatPageCap, failCursorOnce, holdFirstPage, holdCursor } = options
  const allChat = Array.from({ length: totalChatMessages }, (_, idx) => {
    const n = idx + 1
    // Message 115 quotes message 40 (which arrives on page 2).
    const quote = n === 115 ? { messageId: 'm-40', senderName: 'Nguyễn Thu Hà', text: 'Tin 40' } : null
    return chatMessage(n, quote ? { quote } : {})
  })
  const chatConv = {
    ...API_CONVERSATIONS[0],
    id: 'z-1',
    accountId: 'acc-zalo',
    accountIds: ['acc-zalo'],
    provider: 'zalo',
    kind: 'CHAT' as const,
    title: 'Nguyễn Thu Hà',
    subject: null,
    unreadCount: 0,
    lastMessageAt: allChat.at(-1)?.sentAt ?? '2026-10-02T07:00:00Z',
  }
  const emailConv = {
    ...API_CONVERSATIONS[0],
    id: 'e-1',
    accountId: 'acc-1',
    accountIds: ['acc-1'],
    provider: 'gmail',
    kind: 'EMAIL' as const,
    unreadCount: 0,
  }
  const requests: RecordedRequest[] = []
  let shouldFail = failCursorOnce ?? null

  server.use(
    http.get('/api/accounts', () =>
      HttpResponse.json([
        ...API_ACCOUNTS,
        { ...API_ACCOUNTS[0], id: 'acc-zalo', provider: 'zalo', displayName: 'An Zalo', address: 'An Zalo', status: 'CONNECTED' },
      ]),
    ),
    http.get('/api/providers', () =>
      HttpResponse.json([
        ...API_PROVIDERS,
        { type: 'zalo', displayName: 'Zalo', kind: 'CHAT', capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'] },
      ]),
    ),
    http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(apiInitialSync())),
    http.get('/api/conversations/counts', () =>
      HttpResponse.json({
        unread: 0,
        byProvider: {},
        byAccount: {},
        needsReply: 0,
        withAttachments: 0,
        scheduled: 0,
        snoozed: 0,
        unreadByKind: { EMAIL: 0, CHAT: 0 },
      }),
    ),
    http.get('/api/conversations', ({ request }) => {
      const kind = new URL(request.url).searchParams.get('kind')
      const items = kind === 'chat' ? [chatConv] : [emailConv]
      return HttpResponse.json({ items, nextCursor: null })
    }),
    http.get('/api/conversations/:id', ({ params }) => {
      const found = params.id === 'z-1' ? chatConv : params.id === 'e-1' ? emailConv : null
      if (!found) {
        return HttpResponse.json({}, { status: 404 })
      }
      return HttpResponse.json({
        ...found,
        participants: API_PARTICIPANTS,
        reply: { state: 'READY', to: [{ name: found.title, address: 'other' }] },
      })
    }),
    http.get('/api/conversations/:id/messages', async ({ params, request }) => {
      const id = String(params.id)
      const url = new URL(request.url)
      const cursor = url.searchParams.get('cursor')
      const limitParam = url.searchParams.get('limit')
      requests.push({ id, cursor, limit: limitParam })
      if (id === 'z-1' && cursor === null && holdFirstPage) {
        await holdFirstPage
      }
      if (id === 'z-1' && cursor !== null && holdCursor) {
        await holdCursor
      }
      if (shouldFail !== null && cursor === shouldFail) {
        shouldFail = null
        return HttpResponse.json({ title: 'Server error', status: 500, code: 'INTERNAL_ERROR' }, { status: 500 })
      }
      if (id === 'e-1') {
        return HttpResponse.json({ items: API_MESSAGES, nextCursor: null })
      }
      const desc = [...allChat].reverse()
      const offset = cursor ? Number(cursor) : 0
      const pageSize = chatPageCap ?? (limitParam ? Number(limitParam) : 20)
      const items = desc.slice(offset, offset + pageSize)
      const nextCursor = offset + pageSize < desc.length ? String(offset + pageSize) : null
      return HttpResponse.json({ items, nextCursor })
    }),
  )

  return { requests }
}

function mockScrollGeometry(body: HTMLElement, initial: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  const geometry = { ...initial }
  for (const key of Object.keys(geometry) as (keyof typeof geometry)[]) {
    Object.defineProperty(body, key, {
      configurable: true,
      get: () => geometry[key],
      set: (value: number) => {
        geometry[key] = value
      },
    })
  }
  return geometry
}

describe('loading older chat messages on scroll (chat-load-older)', () => {
  it('loads 50 messages first, shows loading status, loads page 2 with cursor on scrolling near top, keeps scroll spot, and enables quote jump', async () => {
    let releasePage2!: () => void
    const holdCursor = new Promise<void>((resolve) => {
      releasePage2 = resolve
    })
    const { requests } = setupBackend({ totalChatMessages: 120, holdCursor })
    renderApp('/messages/z-1', { inbox: null })

    const region = await screen.findByRole('region', { name: 'Cuộc trò chuyện Nguyễn Thu Hà' })
    await waitFor(() => expect(region.querySelectorAll('[data-message-id]')).toHaveLength(50))

    expect(requests).toEqual([{ id: 'z-1', cursor: null, limit: '50' }])
    expect(region.querySelector('[data-message-id="m-120"]')).toBeInTheDocument()
    expect(region.querySelector('[data-message-id="m-71"]')).toBeInTheDocument()
    expect(region.querySelector('[data-message-id="m-40"]')).toBeNull()

    const body = region.querySelector<HTMLElement>('.overflow-auto')!
    const geometry = mockScrollGeometry(body, { scrollHeight: 3000, clientHeight: 600, scrollTop: 120 })
    fireEvent.scroll(body)

    expect(await within(region).findByText('Đang tải…')).toBeInTheDocument()

    geometry.scrollHeight = 5800
    releasePage2()

    await waitFor(() => expect(region.querySelectorAll('[data-message-id]')).toHaveLength(100))
    expect(within(region).queryByText('Đang tải…')).toBeNull()

    expect(requests).toEqual([
      { id: 'z-1', cursor: null, limit: '50' },
      { id: 'z-1', cursor: '50', limit: '50' },
    ])
    // scrollTop shifts by exact delta (5800 - 3000 = 2800), staying at 120 + 2800 = 2920 (not jumping to bottom 5800).
    expect(geometry.scrollTop).toBe(2920)
    // Message m-40 loaded on page 2, so the quote inside m-115 can now jump to it.
    const m115 = region.querySelector<HTMLElement>('[data-message-id="m-115"]')!
    expect(region.querySelector('[data-message-id="m-40"]')).toBeInTheDocument()
    expect(within(m115).getByRole('button', { name: /Tin 40/ })).toBeInTheDocument()
  })

  it('shows retry state on older-page error and loads the page when clicking "Thử lại"', async () => {
    const { requests } = setupBackend({ totalChatMessages: 80, failCursorOnce: '50' })
    const user = userEvent.setup()
    renderApp('/messages/z-1', { inbox: null })

    const region = await screen.findByRole('region', { name: 'Cuộc trò chuyện Nguyễn Thu Hà' })
    await waitFor(() => expect(region.querySelectorAll('[data-message-id]')).toHaveLength(50))

    const body = region.querySelector<HTMLElement>('.overflow-auto')!
    const geometry = mockScrollGeometry(body, { scrollHeight: 2500, clientHeight: 600, scrollTop: 80 })
    fireEvent.scroll(body)

    const alert = await within(region).findByRole('alert')
    expect(alert).toHaveTextContent('Không tải được tin cũ hơn.')
    const retry = within(alert).getByRole('button', { name: 'Thử lại' })

    geometry.scrollHeight = 4000
    await user.click(retry)

    await waitFor(() => expect(region.querySelectorAll('[data-message-id]')).toHaveLength(80))
    expect(within(region).queryByText('Không tải được tin cũ hơn.')).toBeNull()
    expect(requests).toEqual([
      { id: 'z-1', cursor: null, limit: '50' },
      { id: 'z-1', cursor: '50', limit: '50' },
      { id: 'z-1', cursor: '50', limit: '50' },
    ])
  })

  it('does not fetch more or show a top banner when all messages are already loaded', async () => {
    const { requests } = setupBackend({ totalChatMessages: 30 })
    renderApp('/messages/z-1', { inbox: null })

    const region = await screen.findByRole('region', { name: 'Cuộc trò chuyện Nguyễn Thu Hà' })
    await waitFor(() => expect(region.querySelectorAll('[data-message-id]')).toHaveLength(30))

    const body = region.querySelector<HTMLElement>('.overflow-auto')!
    mockScrollGeometry(body, { scrollHeight: 1500, clientHeight: 600, scrollTop: 0 })
    fireEvent.scroll(body)

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(requests).toEqual([{ id: 'z-1', cursor: null, limit: '50' }])
    expect(within(region).queryByText(/Đang tải|tin cũ hơn/)).toBeNull()
  })

  it('auto-loads older messages without scrolling when a short chat does not fill the viewport yet', async () => {
    let releaseFirstPage!: () => void
    const holdFirstPage = new Promise<void>((resolve) => {
      releaseFirstPage = resolve
    })
    const { requests } = setupBackend({ totalChatMessages: 6, chatPageCap: 3, holdFirstPage })
    renderApp('/messages/z-1', { inbox: null })

    const region = await screen.findByRole('region', { name: 'Cuộc trò chuyện Nguyễn Thu Hà' })
    const body = region.querySelector<HTMLElement>('.overflow-auto')!
    // Before page 1 resolves, give the scroll container a viewport taller than its content (no scrollbar possible).
    mockScrollGeometry(body, { scrollHeight: 300, clientHeight: 700, scrollTop: 0 })
    releaseFirstPage()

    // Without any scroll event, ChatThread loads page 2 automatically.
    await waitFor(() => expect(region.querySelectorAll('[data-message-id]')).toHaveLength(6))
    expect(requests).toEqual([
      { id: 'z-1', cursor: null, limit: '50' },
      { id: 'z-1', cursor: '3', limit: '50' },
    ])
  })

  it('keeps email at default page size 20 (no limit=50)', async () => {
    const { requests } = setupBackend()
    renderApp('/inbox/e-1', { inbox: null })

    await screen.findByRole('heading', { level: 2, name: API_CONVERSATIONS[0].subject! })
    await waitFor(() => expect(requests).toEqual([{ id: 'e-1', cursor: null, limit: null }]))
  })
})
