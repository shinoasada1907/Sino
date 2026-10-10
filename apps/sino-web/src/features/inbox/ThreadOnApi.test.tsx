import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_COUNTS, API_MESSAGES, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { lastStream } from '@/test/eventSource'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

type ApiMessage = (typeof API_MESSAGES)[number]

/** The F05 inbox API with the messages of F06, paged by `pageSize` (the cursor is an offset here). */
function backend({ pageSize = 20 }: { pageSize?: number } = {}) {
  const messages: ApiMessage[] = API_MESSAGES.map((message) => ({ ...message }))
  const asked: string[] = []
  let failMessages = false
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/conversations/counts', () => HttpResponse.json(API_COUNTS)),
    http.get('/api/conversations', () => HttpResponse.json({ items: API_CONVERSATIONS, nextCursor: null })),
    http.get('/api/conversations/:id', ({ params }) => {
      const item = API_CONVERSATIONS.find((entry) => entry.id === params.id)
      return item ? HttpResponse.json({ ...item, participants: API_PARTICIPANTS }) : problem({ status: 404, code: 'CONVERSATION_NOT_FOUND' }, 404)
    }),
    http.patch('/api/conversations/:id', ({ params }) => HttpResponse.json({ ...API_CONVERSATIONS.find((entry) => entry.id === params.id), unreadCount: 0 })),
    http.get('/api/conversations/:id/messages', ({ request }) => {
      const params = new URL(request.url).searchParams
      asked.push(params.toString())
      if (failMessages) {
        return problem({ title: 'Down', status: 503, code: 'HTTP_503' }, 503)
      }
      const start = Number(params.get('cursor') ?? 0)
      const next = start + pageSize
      return HttpResponse.json({ items: messages.slice(start, next), nextCursor: next < messages.length ? String(next) : null })
    }),
  )
  return {
    asked,
    arrive: (message: ApiMessage) => messages.unshift(message),
    failMessages: (fail: boolean) => (failMessages = fail),
  }
}

const open = (path: string) => renderApp(path, { inbox: null })
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
/** The older emails, folded: one button each. */
const folded = () => thread().queryAllByRole('button', { expanded: false })
const newest = async () => (await thread().findByText(/^Chào An, mình gửi bản hợp đồng/)).closest('article') as HTMLElement

describe('a conversation read in full on the F06 API (FE-57)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows every email: the older ones folded, the newest open in full with its recipient and file', async () => {
    backend()
    open('/inbox/c-1')

    const mail = await newest()
    expect(mail).toHaveTextContent('Trần Minh Anh')
    expect(mail).toHaveTextContent('tới an.nguyen@gmail.com')
    expect(mail).toHaveTextContent('Bản để ký ở https://acme.vn/hop-dong-q4.')
    expect(within(mail).getByText('hop-dong-q4.pdf')).toBeInTheDocument()
    expect(within(mail).getByText('PDF')).toBeInTheDocument()
    expect(within(mail).getByText('242 KB')).toBeInTheDocument()
    // Oldest first; the own email says "Bạn".
    expect(folded().map((button) => button.textContent)).toEqual([
      expect.stringContaining('Gửi An bản nháp hợp đồng quý 4.'),
      expect.stringContaining('Bạn'),
    ])
    expect(thread().getByText('3 thư · 1 tệp')).toBeInTheDocument()
    expect(thread().queryByRole('article', { name: 'Thư mới nhất' })).toBeNull()
  })

  it('opens a folded email with one click', async () => {
    backend()
    open('/inbox/c-1')
    const user = userEvent.setup()
    await newest()

    await user.click(folded()[1])

    expect(thread().getByText('Anh sửa giúp em điều 4 nhé.').closest('article')).toHaveTextContent('tới Trần Minh Anh')
  })

  it('makes each web address a link that opens in a new tab, without the full stop after it', async () => {
    backend()
    open('/inbox/c-1')

    const link = within(await newest()).getByRole('link', { name: 'https://acme.vn/hop-dong-q4' })

    expect(link).toHaveAttribute('href', 'https://acme.vn/hop-dong-q4')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('loads the older emails with "Xem thư cũ hơn", folded above, until there are no more', async () => {
    const { asked } = backend({ pageSize: 2 })
    open('/inbox/c-1')
    const user = userEvent.setup()
    await newest()
    expect(folded()).toHaveLength(1)

    await user.click(thread().getByRole('button', { name: 'Xem thư cũ hơn' }))

    await vi.waitFor(() => expect(folded()).toHaveLength(2))
    expect(folded()[0]).toHaveTextContent('Gửi An bản nháp hợp đồng quý 4.')
    expect(thread().queryByRole('button', { name: 'Xem thư cũ hơn' })).toBeNull()
    expect(asked).toEqual(['', 'cursor=2'])
  })

  it('shows a new email at the end when the stream says the conversation changed', async () => {
    const api = backend()
    open('/inbox/c-1')
    await newest()

    api.arrive({ ...API_MESSAGES[0], id: 'm-4', sentAt: '2026-10-02T07:04:00Z', text: 'Mình ký rồi nhé.', attachments: [] })
    lastStream().open()
    lastStream().emit('conversations.changed', {
      type: 'conversations.changed',
      accountId: 'acc-1',
      conversationIds: ['c-1'],
      newInbound: 1,
      source: 'sync',
      at: '2026-10-02T07:04:30Z',
    })

    expect((await thread().findByText('Mình ký rồi nhé.')).closest('article')).not.toBeNull()
    expect(folded()).toHaveLength(3)
  })

  it('says when the emails cannot load, shows the start of the newest meanwhile, and loads them on retry', async () => {
    const api = backend()
    api.failMessages(true)
    open('/inbox/c-1')
    const user = userEvent.setup()

    const alert = await thread().findByRole('alert')
    expect(alert).toHaveTextContent('Không tải được các thư của cuộc trò chuyện này.')
    const latest = thread().getByRole('article', { name: 'Thư mới nhất' })
    expect(latest).toHaveTextContent('Chào An, mình gửi bản hợp đồng đã sửa theo góp ý hôm qua.')
    expect(latest).not.toHaveTextContent('sẽ có ở bản sau')
    api.failMessages(false)
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await newest()).toHaveTextContent('Bản để ký ở')
    expect(thread().queryByRole('alert')).toBeNull()
  })

  it('keeps the start of the newest email, without an error, on a backend that has no messages yet', async () => {
    backend()
    server.use(http.get('/api/conversations/:id/messages', () => problem({ status: 404, code: 'RESOURCE_NOT_FOUND' }, 404)))
    open('/inbox/c-1')

    const latest = await thread().findByRole('article', { name: 'Thư mới nhất' })

    expect(latest).toHaveTextContent('Đọc cả cuộc trò chuyện ngay trong Sino sẽ có ở bản sau.')
    expect(thread().queryByRole('alert')).toBeNull()
  })
})
