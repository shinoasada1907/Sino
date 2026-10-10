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
const TO = [{ name: 'Trần Minh Anh', address: 'minhanh@acme.vn' }]
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

type ApiMessage = Record<string, unknown>
type Outcome = 'SENT' | 'SEND_FAILED' | 'UNKNOWN' | 'NOT_ALLOWED' | 'NETWORK' | 'IN_PROGRESS'

/**
 * The F10 API over c-1: each `POST …/messages` takes the next outcome (then sends). A stored message (sent, failed or
 * unknown) joins the list the server gives, as the backend keeps it.
 */
function backend(outcomes: Outcome[] = []) {
  const messages: ApiMessage[] = API_MESSAGES.map((message) => ({ ...message, clientMessageId: null }))
  const posts: { text: string; clientMessageId: string }[] = []
  const deletes: string[] = []
  let reads = 0
  let failList = false
  let failDelete = false
  let replyState = 'READY'
  let next = 0
  const store = (body: { text: string; clientMessageId: string }, status: string, id: string) => {
    const message = {
      ...API_MESSAGES[1],
      id,
      status,
      sentAt: NOW.toISOString(),
      text: body.text,
      clientMessageId: body.clientMessageId,
    }
    const at = messages.findIndex((entry) => entry.clientMessageId === body.clientMessageId)
    if (at >= 0) {
      messages[at] = { ...message, id: messages[at].id as string }
    } else {
      messages.unshift(message)
    }
    return messages.find((entry) => entry.clientMessageId === body.clientMessageId) as ApiMessage
  }
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/conversations/counts', () => HttpResponse.json(API_COUNTS)),
    http.get('/api/conversations', () => HttpResponse.json({ items: API_CONVERSATIONS, nextCursor: null })),
    http.get('/api/conversations/:id', ({ params }) =>
      HttpResponse.json({ ...API_CONVERSATIONS.find((entry) => entry.id === params.id), participants: API_PARTICIPANTS, reply: { state: replyState, to: TO } }),
    ),
    http.patch('/api/conversations/:id', ({ params }) => HttpResponse.json({ ...API_CONVERSATIONS.find((entry) => entry.id === params.id), unreadCount: 0 })),
    http.get('/api/conversations/:id/messages', () => {
      reads += 1
      return failList ? problem({ title: 'Down', status: 503, code: 'HTTP_503' }, 503) : HttpResponse.json({ items: messages, nextCursor: null })
    }),
    http.post('/api/conversations/:id/messages', async ({ request }) => {
      const body = (await request.json()) as { text: string; clientMessageId: string }
      posts.push(body)
      const outcome = outcomes[next] ?? 'SENT'
      const id = `m-${10 + next}`
      next += 1
      // As slow as a network, so the page shows "Đang gửi" first.
      await new Promise((resolve) => setTimeout(resolve, 50))
      switch (outcome) {
        case 'NETWORK':
          return HttpResponse.error()
        case 'IN_PROGRESS':
          // A first try with this ID is still running on the server.
          store(body, 'PENDING', id)
          return problem({ title: 'Conflict', status: 409, code: 'SEND_IN_PROGRESS' }, 409)
        case 'NOT_ALLOWED':
          replyState = 'NEEDS_PERMISSION'
          return problem({ title: 'Conflict', status: 409, code: 'REPLY_NOT_ALLOWED', state: 'NEEDS_PERMISSION' }, 409)
        case 'SEND_FAILED':
          return problem({ title: 'Bad gateway', status: 502, code: 'SEND_FAILED', messageId: store(body, 'FAILED', id).id }, 502)
        case 'UNKNOWN':
          return problem({ title: 'Gateway timeout', status: 504, code: 'SEND_OUTCOME_UNKNOWN', messageId: store(body, 'UNKNOWN', id).id }, 504)
        default:
          return HttpResponse.json(store(body, 'SENT', id), { status: 201 })
      }
    }),
    http.delete('/api/conversations/:id/messages/:messageId', ({ params }) => {
      deletes.push(String(params.messageId))
      if (failDelete) {
        return problem({ title: 'Conflict', status: 409, code: 'MESSAGE_NOT_DELETABLE' }, 409)
      }
      const at = messages.findIndex((entry) => entry.id === params.messageId)
      messages.splice(at, 1)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return {
    posts,
    deletes,
    reads: () => reads,
    failList: (fail: boolean) => (failList = fail),
    failDelete: (fail: boolean) => (failDelete = fail),
    /** The server finishes a send on its own (the first try that was still running). */
    settle: (clientMessageId: string, status: string) => {
      const message = messages.find((entry) => entry.clientMessageId === clientMessageId)
      if (message) {
        message.status = status
      }
    },
  }
}

const changed = () =>
  lastStream().emit('conversations.changed', { type: 'conversations.changed', accountId: 'acc-1', conversationIds: ['c-1'], newInbound: 0, source: 'sync', at: NOW.toISOString() })

const open = () => renderApp('/inbox/c-1', { inbox: null })
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
/** The open email that holds `text`. */
const mailWith = (text: string) => thread().getByText(text).closest('article') as HTMLElement

async function reply(text: string) {
  const user = userEvent.setup()
  const box = await thread().findByRole('textbox', { name: 'Trả lời Trần Minh Anh' })
  await user.type(box, text)
  await user.click(thread().getByRole('button', { name: 'Gửi' }))
  return user
}

describe('replying on the F10 API (FE-62)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the reply as "Đang gửi" at once, sends it with a new clientMessageId, then shows it sent', async () => {
    const { posts, reads } = backend()
    open()
    await thread().findByRole('textbox', { name: 'Trả lời Trần Minh Anh' })
    const readsBefore = reads()

    await reply('Em nhận được rồi.')

    expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Đang gửi')
    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).not.toHaveTextContent('Đang gửi'))
    expect(posts).toEqual([{ text: 'Em nhận được rồi.', clientMessageId: expect.stringMatching(/^[0-9a-f-]{36}$/) }])
    expect(thread().getAllByText('Em nhận được rồi.')).toHaveLength(1)
    // The list is read again, so the copy the server stored stands in for the one of this browser.
    await vi.waitFor(() => expect(reads()).toBe(readsBefore + 1))
  })

  it('sends again a reply whose answer never came as the same one message', async () => {
    const { posts } = backend(['NETWORK', 'SENT'])
    open()
    const user = await reply('Em nhận được rồi.')
    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Chưa rõ đã gửi chưa'))
    expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Mất kết nối khi gửi. Gửi lại không làm thư bị gửi hai lần.')

    await user.click(within(mailWith('Em nhận được rồi.')).getByRole('button', { name: 'Gửi lại' }))

    // While it is on its way, and once it went.
    expect(thread().getAllByText('Em nhận được rồi.')).toHaveLength(1)
    expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Đang gửi')
    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).not.toHaveTextContent(/Chưa rõ|Đang gửi/))
    expect(thread().getAllByText('Em nhận được rồi.')).toHaveLength(1)
    expect(posts.map((post) => post.clientMessageId)).toEqual([posts[0].clientMessageId, posts[0].clientMessageId])
  })

  it('keeps a reply as "Đang gửi" while the server is still sending a first try of it', async () => {
    backend(['IN_PROGRESS'])
    open()
    await reply('Em nhận được rồi.')

    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Đang gửi')
    expect(mailWith('Em nhận được rồi.')).not.toHaveTextContent('Không gửi được')
  })

  it('shows the reply sent once the server finishes the first try on its own', async () => {
    const api = backend(['IN_PROGRESS'])
    open()
    await reply('Em nhận được rồi.')
    await vi.waitFor(() => expect(api.posts).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 200))

    api.settle(api.posts[0].clientMessageId, 'SENT')
    lastStream().open()
    changed()

    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).not.toHaveTextContent('Đang gửi'))
  })

  it('reads the list again after a failed send, so a copy read meanwhile does not hide the way to send again', async () => {
    const api = backend(['SEND_FAILED'])
    open()
    await thread().findByRole('textbox', { name: 'Trả lời Trần Minh Anh' })
    const readsBefore = api.reads()
    await reply('Em nhận được rồi.')

    await vi.waitFor(() => expect(within(mailWith('Em nhận được rồi.')).getByRole('button', { name: 'Gửi lại' })).toBeInTheDocument())
    await vi.waitFor(() => expect(api.reads()).toBe(readsBefore + 1))
  })

  it('offers no reply box while the emails cannot load, so a reply cannot vanish', async () => {
    const api = backend()
    api.failList(true)
    open()

    expect(await thread().findByRole('alert')).toHaveTextContent('Không tải được các thư của cuộc trò chuyện này.')
    expect(thread().queryByRole('textbox')).toBeNull()
  })

  it('says when the server refuses to throw a failed reply away, and keeps it', async () => {
    const api = backend(['SEND_FAILED'])
    api.failDelete(true)
    open()
    const user = await reply('Em nhận được rồi.')
    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Không gửi được'))

    await user.click(within(mailWith('Em nhận được rồi.')).getByRole('button', { name: 'Bỏ' }))

    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Không bỏ được thư này. Hãy thử lại.'))
    expect(api.deletes).toEqual(['m-10'])
  })

  it('keeps a reply the provider refused, and sends it again with the same clientMessageId', async () => {
    const { posts } = backend(['SEND_FAILED', 'SENT'])
    open()
    const user = await reply('Em nhận được rồi.')

    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Không gửi được'))
    await user.click(within(mailWith('Em nhận được rồi.')).getByRole('button', { name: 'Gửi lại' }))

    await vi.waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1].clientMessageId).toBe(posts[0].clientMessageId)
    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).not.toHaveTextContent(/Không gửi được|Đang gửi/))
    expect(within(mailWith('Em nhận được rồi.')).queryByRole('button', { name: 'Gửi lại' })).toBeNull()
  })

  it('still says a reply did not go once a newer one folds it', async () => {
    backend(['SEND_FAILED', 'SENT'])
    open()
    const user = await reply('Em nhận được rồi.')
    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Không gửi được'))

    await user.type(thread().getByRole('textbox', { name: 'Trả lời Trần Minh Anh' }), 'Anh xem giúp em nhé.')
    await user.click(thread().getByRole('button', { name: 'Gửi' }))

    await vi.waitFor(() => expect(thread().getByRole('button', { expanded: false, name: /Em nhận được rồi\./ })).toHaveTextContent('Không gửi được'))
  })

  it('throws away a failed reply the server kept, asking the server to delete it', async () => {
    const { deletes } = backend(['SEND_FAILED'])
    open()
    const user = await reply('Em nhận được rồi.')
    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Không gửi được'))

    await user.click(within(mailWith('Em nhận được rồi.')).getByRole('button', { name: 'Bỏ' }))

    await vi.waitFor(() => expect(thread().queryByText('Em nhận được rồi.')).toBeNull())
    expect(deletes).toEqual(['m-10'])
  })

  it('throws away a reply whose answer never came without asking the server, and keeps it until then through a refresh', async () => {
    const { deletes } = backend(['NETWORK'])
    open()
    const user = await reply('Em nhận được rồi.')
    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Chưa rõ đã gửi chưa'))

    // New mail elsewhere reads the conversation again; the text typed must not be lost.
    lastStream().open()
    changed()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Chưa rõ đã gửi chưa')

    await user.click(within(mailWith('Em nhận được rồi.')).getByRole('button', { name: 'Bỏ' }))

    expect(thread().queryByText('Em nhận được rồi.')).toBeNull()
    expect(deletes).toEqual([])
  })

  it('says when Sino does not know yet whether the reply went, with nothing to press', async () => {
    backend(['UNKNOWN'])
    open()
    await reply('Em nhận được rồi.')

    await vi.waitFor(() => expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Chưa rõ đã gửi chưa'))
    expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Sino đang kiểm tra với Gmail.')
    expect(within(mailWith('Em nhận được rồi.')).queryByRole('button', { name: 'Gửi lại' })).toBeNull()
  })

  it('reads the conversation again when sending is not allowed any more: the notice replaces the box', async () => {
    backend(['NOT_ALLOWED'])
    open()
    await reply('Em nhận được rồi.')

    expect(await thread().findByText('Sino chưa có quyền gửi thư từ an.nguyen@gmail.com')).toBeInTheDocument()
    expect(thread().queryByRole('textbox')).toBeNull()
    expect(mailWith('Em nhận được rồi.')).toHaveTextContent('Không gửi được')
  })
})
