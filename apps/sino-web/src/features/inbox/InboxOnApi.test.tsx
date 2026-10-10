import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const NOT_FOUND = { title: 'Not found', status: 404, code: 'CONVERSATION_NOT_FOUND' }
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

type Item = (typeof API_CONVERSATIONS)[number]
type Change = { read?: boolean; archived?: boolean }

const VIEWS: Record<string, (item: Item) => boolean> = {
  all: (item) => !item.archived,
  unread: (item) => !item.archived && item.unreadCount > 0,
  reply: (item) => !item.archived && item.needsReply,
  archived: (item) => item.archived,
}

/** The F05 inbox API over a few conversations held in memory, paged by `pageSize` (the cursor is an offset here). */
function backend({ items = API_CONVERSATIONS, pageSize = 30, refuse = false }: { items?: Item[]; pageSize?: number; refuse?: boolean } = {}) {
  let state = items.map((item) => ({ ...item }))
  const asked: string[] = []
  const changes: [string, Change][] = []
  const counted = (test: (item: Item) => boolean) => state.filter((item) => !item.archived && test(item)).length
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/conversations/counts', () =>
      HttpResponse.json({
        unread: counted((item) => item.unreadCount > 0),
        byProvider: { gmail: counted((item) => item.unreadCount > 0) },
        needsReply: counted((item) => item.needsReply),
        withAttachments: counted((item) => item.hasAttachments),
        scheduled: 0,
        snoozed: 0,
      }),
    ),
    http.get('/api/conversations', ({ request }) => {
      const params = new URL(request.url).searchParams
      asked.push(params.toString())
      const shown = state.filter(VIEWS[params.get('view') ?? 'all'] ?? (() => false))
      const start = Number(params.get('cursor') ?? 0)
      const next = start + pageSize
      return HttpResponse.json({ items: shown.slice(start, next), nextCursor: next < shown.length ? String(next) : null })
    }),
    http.get('/api/conversations/:id', ({ params }) => {
      const item = state.find((entry) => entry.id === params.id)
      return item ? HttpResponse.json({ ...item, participants: API_PARTICIPANTS }) : problem(NOT_FOUND, 404)
    }),
    // The F05 backend these tests were written for has no messages API (F06): the thread shows the newest preview.
    http.get('/api/conversations/:id/messages', () => problem({ title: 'Not found', status: 404, code: 'RESOURCE_NOT_FOUND' }, 404)),
    http.patch('/api/conversations/:id', async ({ params, request }) => {
      const change = (await request.json()) as Change
      changes.push([String(params.id), change])
      if (refuse) {
        // As slow as a network, so the page shows the change before it goes back.
        await new Promise((resolve) => setTimeout(resolve, 50))
        return problem({ title: 'Down', status: 503, code: 'HTTP_503' }, 503)
      }
      state = state.map((item) =>
        item.id !== params.id
          ? item
          : {
              ...item,
              ...(change.read === undefined ? {} : { unreadCount: change.read ? 0 : Math.max(1, item.unreadCount) }),
              ...(change.archived === undefined ? {} : { archived: change.archived }),
            },
      )
      return HttpResponse.json(state.find((item) => item.id === params.id))
    }),
  )
  return { asked, changes }
}

/** A response that waits until the test lets it go; then the request goes on to the backend above. */
function held() {
  let release = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  return { gate, release }
}

const open = (path: string) => renderApp(path, { inbox: null })
const sources = () => within(screen.getByRole('complementary', { name: 'Nguồn và bộ lọc' }))
const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
const rowTitles = () => list().queryAllByRole('link').map((link) => link.querySelector('[data-slot="row-title"]')?.textContent)

describe('Hộp thư on the F05 API (FE-50)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the conversations the server gives, with its counts of unread conversations (D-70)', async () => {
    const { asked } = backend()
    open('/inbox')

    expect(await list().findByRole('link', { name: /Trần Minh Anh/ })).toBeInTheDocument()
    expect(rowTitles()).toEqual(['Trần Minh Anh', 'Ngân hàng ACB'])
    expect(list().getByText('1 chưa đọc')).toBeInTheDocument()
    expect(sources().getByRole('link', { name: /Gmail/ })).toHaveTextContent('1')
    expect(within(list().getByRole('link', { name: /Trần Minh Anh/ })).getByLabelText('Chưa đọc')).toBeInTheDocument()
    expect(asked).toEqual(['view=all'])
  })

  it('asks the server for the view and the source the user picks', async () => {
    const { asked } = backend()
    const { router } = open('/inbox?source=gmail')
    const user = userEvent.setup()
    await list().findByRole('link', { name: /Trần Minh Anh/ })

    await user.click(within(list().getByRole('group', { name: 'Lọc danh sách' })).getByRole('button', { name: 'Chưa đọc' }))

    expect(router.state.location.search).toBe('?source=gmail&view=unread')
    await vi.waitFor(() => expect(rowTitles()).toEqual(['Trần Minh Anh']))
    expect(asked).toEqual(['view=all&provider=gmail', 'view=unread&provider=gmail'])
  })

  it('keeps the filters and the rows that still match while another view loads', async () => {
    backend({ pageSize: 1 })
    const unread = held()
    const archived = held()
    server.use(
      http.get('/api/conversations', async ({ request }) => {
        const view = new URL(request.url).searchParams.get('view')
        await (view === 'unread' ? unread.gate : view === 'archived' ? archived.gate : undefined)
        return undefined
      }),
    )
    open('/inbox')
    const user = userEvent.setup()
    expect(await list().findByRole('button', { name: 'Tải thêm' })).toBeInTheDocument()

    await user.click(within(list().getByRole('group', { name: 'Lọc danh sách' })).getByRole('button', { name: 'Chưa đọc' }))
    expect(rowTitles()).toEqual(['Trần Minh Anh'])
    expect(list().getByRole('group', { name: 'Lọc danh sách' })).toBeInTheDocument()
    expect(list().queryByRole('button', { name: 'Tải thêm' })).toBeNull()
    unread.release()

    await user.click(sources().getByRole('link', { name: /Đã lưu trữ/ }))
    expect(list().getByRole('status', { name: 'Đang tải danh sách' })).toBeInTheDocument()
    expect(list().queryByText('Không có cuộc trò chuyện nào')).toBeNull()
    archived.release()
    expect(await list().findByText('Không có cuộc trò chuyện nào')).toBeInTheDocument()
  })

  it('says when the next page cannot load, and loads it on retry', async () => {
    const third = { ...API_CONVERSATIONS[1], id: 'c-3', title: 'Điện lực Hà Nội' }
    backend({ items: [...API_CONVERSATIONS, third], pageSize: 2 })
    let fail = true
    server.use(
      http.get('/api/conversations', ({ request }) =>
        fail && new URL(request.url).searchParams.has('cursor') ? problem({ title: 'Down', status: 503, code: 'HTTP_503' }, 503) : undefined,
      ),
    )
    open('/inbox')
    const user = userEvent.setup()

    await user.click(await list().findByRole('button', { name: 'Tải thêm' }))
    const alert = await list().findByRole('alert')
    expect(alert).toHaveTextContent('Không tải thêm được.')
    expect(rowTitles()).toEqual(['Trần Minh Anh', 'Ngân hàng ACB'])

    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    expect(await list().findByRole('link', { name: /Điện lực Hà Nội/ })).toBeInTheDocument()
  })

  it('loads the next page with the cursor when the end of the list is reached, until there is no more', async () => {
    const third = { ...API_CONVERSATIONS[1], id: 'c-3', title: 'Điện lực Hà Nội', lastMessageAt: '2026-09-30T02:00:00Z' }
    const { asked } = backend({ items: [...API_CONVERSATIONS, third], pageSize: 2 })
    open('/inbox')
    const user = userEvent.setup()

    await user.click(await list().findByRole('button', { name: 'Tải thêm' }))

    expect(await list().findByRole('link', { name: /Điện lực Hà Nội/ })).toBeInTheDocument()
    expect(rowTitles()).toEqual(['Trần Minh Anh', 'Ngân hàng ACB', 'Điện lực Hà Nội'])
    expect(list().queryByRole('button', { name: 'Tải thêm' })).toBeNull()
    expect(asked).toEqual(['view=all', 'view=all&cursor=2'])
  })

  it('opens a conversation: reads it once, shows the start of its newest email, and says replying comes later', async () => {
    const { changes } = backend()
    const detail = held()
    server.use(
      http.get('/api/conversations/:id', async ({ params }) => {
        await (params.id === 'counts' ? undefined : detail.gate)
        return undefined
      }),
    )
    open('/inbox')
    const user = userEvent.setup()

    await user.click(await list().findByRole('link', { name: /Trần Minh Anh/ }))

    // The row of the list opens the conversation at once; the reply area waits for the detail.
    expect(await thread().findByRole('heading', { level: 2, name: 'Hợp đồng quý 4' })).toBeInTheDocument()
    expect(thread().queryByRole('textbox')).toBeNull()
    expect(thread().queryByText('Sino chưa gửi được thư')).toBeNull()
    detail.release()
    const latest = await thread().findByRole('article', { name: 'Thư mới nhất' })
    expect(latest).toHaveTextContent('Thư mới nhất · 13:41 hôm nay')
    expect(latest).toHaveTextContent('Chào An, mình gửi bản hợp đồng đã sửa theo góp ý hôm qua.')
    expect(latest).toHaveTextContent('Sino mới hiện đoạn đầu của thư mới nhất. Đọc cả cuộc trò chuyện ngay trong Sino sẽ có ở bản sau.')
    const notice = thread().getByText('Sino chưa gửi được thư').closest('[role="status"]') as HTMLElement
    expect(notice).toHaveTextContent('Trả lời từ Sino sẽ có ở bản sau. Bây giờ bạn trả lời trong Gmail.')
    expect(within(notice).queryByRole('button')).toBeNull()
    expect(thread().queryByRole('textbox')).toBeNull()

    expect(await list().findByText('Đã đọc hết')).toBeInTheDocument()
    expect(within(list().getByRole('link', { name: /Trần Minh Anh/ })).queryByLabelText('Chưa đọc')).toBeNull()
    expect(changes).toEqual([['c-1', { read: true }]])
  })

  it('archives: back to the list without the conversation, which the archive view then shows and can bring back', async () => {
    const { asked, changes } = backend()
    const { router } = open('/inbox/c-2')
    const user = userEvent.setup()
    expect(await thread().findByRole('article', { name: 'Thư mới nhất' })).toHaveTextContent('Thư mới nhất không có chữ.')

    await user.click(await thread().findByRole('button', { name: 'Lưu trữ' }))

    expect(router.state.location.pathname).toBe('/inbox')
    expect(rowTitles()).toEqual(['Trần Minh Anh'])
    await vi.waitFor(() => expect(changes).toEqual([['c-2', { archived: true }]]))

    await user.click(sources().getByRole('link', { name: /Đã lưu trữ/ }))
    expect(await list().findByRole('link', { name: /Ngân hàng ACB/ })).toBeInTheDocument()
    // The list on screen did not load again; the archive view loaded when it was shown.
    expect(asked).toEqual(['view=all', 'view=archived'])

    await user.click(list().getByRole('link', { name: /Ngân hàng ACB/ }))
    await user.click(await thread().findByRole('button', { name: 'Bỏ lưu trữ' }))

    expect(router.state.location.search).toBe('?view=archived')
    expect(list().queryByRole('link', { name: /Ngân hàng ACB/ })).toBeNull()
    await vi.waitFor(() => expect(changes).toEqual([['c-2', { archived: true }], ['c-2', { archived: false }]]))
  })

  it('marks unread: back to the list with the conversation unread, and does not read it again', async () => {
    const { changes } = backend()
    const { router } = open('/inbox/c-1')
    const user = userEvent.setup()
    await vi.waitFor(() => expect(changes).toEqual([['c-1', { read: true }]]))

    await user.click(await thread().findByRole('button', { name: 'Đánh dấu chưa đọc' }))

    expect(router.state.location.pathname).toBe('/inbox')
    expect(within(list().getByRole('link', { name: /Trần Minh Anh/ })).getByLabelText('Chưa đọc')).toBeInTheDocument()
    expect(list().getByText('1 chưa đọc')).toBeInTheDocument()
    await vi.waitFor(() => expect(changes).toEqual([['c-1', { read: true }], ['c-1', { read: false }]]))

    // Opening it again is a new opening: it is read again.
    await user.click(list().getByRole('link', { name: /Trần Minh Anh/ }))
    await vi.waitFor(() => expect(changes).toEqual([['c-1', { read: true }], ['c-1', { read: false }], ['c-1', { read: true }]]))
  })

  it('puts the unread count back when the server refuses to read, and does not ask again', async () => {
    const { changes } = backend({ refuse: true })
    open('/inbox/c-1')

    expect(await list().findByText('Đã đọc hết')).toBeInTheDocument()
    await vi.waitFor(() => expect(changes).toEqual([['c-1', { read: true }]]))
    expect(await list().findByText('1 chưa đọc')).toBeInTheDocument()
    expect(within(list().getByRole('link', { name: /Trần Minh Anh/ })).getByLabelText('Chưa đọc')).toBeInTheDocument()
    // Long enough for a second request to arrive if the page sent one after the count came back.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(changes).toHaveLength(1)
  })

  it('opens a conversation that is not in the loaded list, and says when the server does not know it', async () => {
    const archived = { ...API_CONVERSATIONS[1], id: 'c-7', title: 'Hội phụ huynh', subject: 'Họp lớp', archived: true }
    backend({ items: [...API_CONVERSATIONS, archived] })
    const view = open('/inbox/c-7')

    expect(await thread().findByRole('heading', { level: 2, name: 'Họp lớp' })).toBeInTheDocument()
    view.unmount()

    open('/inbox/c-9')
    expect(await thread().findByText('Không tìm thấy cuộc trò chuyện này.')).toBeInTheDocument()
  })

  it('says when a conversation cannot open, and opens it on retry', async () => {
    const archived = { ...API_CONVERSATIONS[1], id: 'c-7', title: 'Hội phụ huynh', subject: 'Họp lớp', archived: true }
    backend({ items: [...API_CONVERSATIONS, archived] })
    let fail = true
    server.use(
      http.get('/api/conversations/:id', ({ params }) =>
        fail && params.id !== 'counts' ? problem({ title: 'Down', status: 503, code: 'HTTP_503' }, 503) : undefined,
      ),
    )
    open('/inbox/c-7')
    const user = userEvent.setup()

    const alert = await thread().findByRole('alert')
    expect(alert).toHaveTextContent('Không mở được cuộc trò chuyện này.')
    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await thread().findByRole('heading', { level: 2, name: 'Họp lớp' })).toBeInTheDocument()
  })

  it('says when the list cannot load, and loads it on retry', async () => {
    backend()
    let fail = true
    server.use(http.get('/api/conversations', () => (fail ? problem({ title: 'Down', status: 503, code: 'HTTP_503' }, 503) : undefined)))
    open('/inbox')
    const user = userEvent.setup()

    expect(await screen.findByText('Không tải được hộp thư')).toBeInTheDocument()
    // The server answered, so the page does not say it did not answer.
    expect(screen.getByText('Máy chủ Sino trả lỗi khi lấy hộp thư. Thư và tin nhắn của bạn vẫn an toàn ở nhà cung cấp.')).toBeInTheDocument()
    expect(screen.getByText(/HTTP_503/)).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))

    expect(await list().findByRole('link', { name: /Trần Minh Anh/ })).toBeInTheDocument()
  })

  it('says the server does not answer when nothing answers', async () => {
    backend()
    server.use(http.get('/api/conversations', () => HttpResponse.error()))
    open('/inbox')

    expect(await screen.findByText('Máy chủ Sino không phản hồi. Thư và tin nhắn của bạn vẫn an toàn ở nhà cung cấp.')).toBeInTheDocument()
    expect(screen.getByText(/NETWORK_ERROR/)).toBeInTheDocument()
  })
})
