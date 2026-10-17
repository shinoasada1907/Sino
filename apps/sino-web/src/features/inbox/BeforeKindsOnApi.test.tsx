import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
// Moving to the screen of the other kind builds the whole app twice, slow when every test file runs at once.
const MOVE = { timeout: 8000 }

/**
 * The backend on `dev` before BE-110 and BE-111 (FE-114): providers without `kind`, counts without `unreadByKind`, and a
 * list that ignores the `kind` it is asked for. The web must still put every Gmail mail in Hộp thư (D-308).
 */
function backendBeforeKinds() {
  const asked: string[] = []
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS.map(({ type, displayName, capabilities }) => ({ type, displayName, capabilities })))),
    http.get('/api/conversations/counts', ({ request }) => {
      asked.push(`counts?${new URL(request.url).searchParams}`)
      return HttpResponse.json({ unread: 1, byProvider: { gmail: 1 }, needsReply: 1, withAttachments: 1, scheduled: 0, snoozed: 0 })
    }),
    http.get('/api/conversations', ({ request }) => {
      asked.push(`list?${new URL(request.url).searchParams}`)
      return HttpResponse.json({ items: API_CONVERSATIONS, nextCursor: null })
    }),
    http.get('/api/conversations/:id', ({ params }) => {
      const item = API_CONVERSATIONS.find((entry) => entry.id === params.id)
      return item
        ? HttpResponse.json({ ...item, participants: API_PARTICIPANTS })
        : HttpResponse.json({ title: 'Not found', status: 404, code: 'CONVERSATION_NOT_FOUND' }, { status: 404 })
    }),
    http.get('/api/conversations/:id/messages', () => HttpResponse.json({ items: [], nextCursor: null })),
    http.patch('/api/conversations/:id', ({ params }) => HttpResponse.json({ ...API_CONVERSATIONS.find((entry) => entry.id === params.id), unreadCount: 0 })),
  )
  return asked
}

const open = (path: string) => renderApp(path, { inbox: null })
const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
const rowTitles = () =>
  list()
    .queryAllByRole('link')
    .flatMap((link) => link.querySelector('[data-slot="row-title"]')?.textContent ?? [])

describe('Tin nhắn and Hộp thư on the backend before BE-110 and BE-111 (FE-114)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists every Gmail mail in Hộp thư, with the unread of the counts, asking for the email kind', async () => {
    const asked = backendBeforeKinds()
    open('/inbox')

    expect(await list().findByRole('heading', { level: 1, name: 'Hộp thư' })).toBeInTheDocument()
    expect(await list().findByText('1 chưa đọc')).toBeInTheDocument()
    expect(rowTitles()).toEqual(['Trần Minh Anh', 'Ngân hàng ACB'])
    expect(asked).toContain('list?view=all&kind=email')
    expect(asked).toContain('counts?kind=email')
  })

  it('shows Tin nhắn empty with one way to connect, since no provider of the catalog is a chat yet', async () => {
    backendBeforeKinds()
    open('/messages')

    expect(await screen.findByRole('heading', { level: 1, name: 'Tin nhắn đang trống.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kết nối tài khoản' })).toHaveAttribute('href', '/accounts?connect=new')
    expect(screen.queryByRole('link', { name: 'Kết nối Gmail' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Danh sách cuộc trò chuyện' })).toBeNull()
  })

  it('opens a mail linked under /messages in Hộp thư, and an old /inbox link where it is', async () => {
    backendBeforeKinds()
    const { router } = open('/messages/c-1')

    await waitFor(() => expect(router.state.location.pathname).toBe('/inbox/c-1'), MOVE)
    expect(await screen.findByRole('heading', { name: 'Hợp đồng quý 4' }, MOVE)).toBeInTheDocument()

    await router.navigate('/inbox/c-2')
    expect(await screen.findByRole('heading', { name: 'Sao kê tháng 9' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/inbox/c-2')
  })
})
