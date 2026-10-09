import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_COUNTS, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { fetchConversation, fetchConversations, fetchInbox, updateConversation } from './inbox.api'

const NOT_FOUND = { title: 'Not found', status: 404, code: 'CONVERSATION_NOT_FOUND' }
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

describe('the Hộp thư requests on the F05 API (D-56)', () => {
  it('builds the frame of the screen from the accounts, the providers and the counts', async () => {
    server.use(
      http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
      http.get('/api/conversations/counts', () => HttpResponse.json({ ...API_COUNTS, byProvider: { gmail: 1, zalo: 4 } })),
    )

    const inbox = await fetchInbox()

    expect(Date.parse(inbox.generatedAt)).not.toBeNaN()
    expect(inbox.providers).toEqual([{ type: 'gmail', displayName: 'Gmail' }])
    expect(inbox.accounts).toEqual([
      { id: 'acc-1', provider: 'gmail', externalAccountId: 'an.nguyen@gmail.com', status: 'CONNECTED', syncProgress: null, statusChangedAt: null },
      { id: 'acc-2', provider: 'gmail', externalAccountId: 'cong.viec@gmail.com', status: 'AUTH_EXPIRED', syncProgress: null, statusChangedAt: null },
    ])
    expect(inbox.counts).toEqual({
      unread: 1,
      byProvider: [
        { provider: 'gmail', unread: 1 },
        { provider: 'zalo', unread: 4 },
      ],
      needsReply: 1,
      withAttachments: 1,
      scheduled: 0,
      snoozed: 0,
    })
  })

  it('asks for one page of a view and a source, and turns the items into the screen contract', async () => {
    const asked: string[] = []
    server.use(
      http.get('/api/conversations', ({ request }) => {
        asked.push(new URL(request.url).search)
        return HttpResponse.json({ items: API_CONVERSATIONS, nextCursor: 'MjAyNi0xMC0wMQ' })
      }),
    )

    const page = await fetchConversations({ view: 'unread', source: 'gmail' }, null)

    expect(asked).toEqual(['?view=unread&provider=gmail'])
    expect(page.nextCursor).toBe('MjAyNi0xMC0wMQ')
    expect(page.items[0]).toEqual({ ...API_CONVERSATIONS[0], linked: [] })
    // An item without text (only a file) has no preview.
    expect(page.items[1]).toEqual(expect.objectContaining({ id: 'c-2', snippet: '', linked: [] }))
  })

  it('asks for the next page with the cursor, and for every source without a provider', async () => {
    const asked: string[] = []
    server.use(
      http.get('/api/conversations', ({ request }) => {
        asked.push(new URL(request.url).search)
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )

    const page = await fetchConversations({ view: 'all', source: null }, 'a/b+c')

    expect(asked).toEqual(['?view=all&cursor=a%2Fb%2Bc'])
    expect(page).toEqual({ items: [], nextCursor: null })
  })

  it('opens one conversation: its item, and its people as members; messages and sending wait for F06 and F10', async () => {
    server.use(http.get('/api/conversations/:id', ({ params }) => HttpResponse.json({ ...API_CONVERSATIONS[0], id: params.id, participants: API_PARTICIPANTS })))

    const { item, detail } = await fetchConversation('c-1')

    expect(item).toEqual({ ...API_CONVERSATIONS[0], linked: [] })
    expect(item).not.toHaveProperty('participants')
    expect(detail).toEqual({
      id: 'c-1',
      messages: null,
      firstUnreadId: null,
      linked: null,
      members: [
        { name: 'Trần Minh Anh', owner: false, joinedRecently: false },
        { name: 'Bạn', owner: false, joinedRecently: false },
      ],
      files: null,
      canSend: null,
      previousCursor: null,
    })
  })

  it('names a person without a name by their address', async () => {
    const nameless = [{ externalId: 'ai.do@example.com', name: null, avatarUrl: null, self: false }]
    server.use(http.get('/api/conversations/:id', () => HttpResponse.json({ ...API_CONVERSATIONS[0], participants: nameless })))

    const { detail } = await fetchConversation('c-1')

    expect(detail.members).toEqual([{ name: 'ai.do@example.com', owner: false, joinedRecently: false }])
  })

  it('reports a conversation the API does not know as CONVERSATION_NOT_FOUND', async () => {
    server.use(http.get('/api/conversations/:id', () => problem(NOT_FOUND, 404)))

    await expect(fetchConversation('c-9')).rejects.toMatchObject({ status: 404, code: 'CONVERSATION_NOT_FOUND' })
  })

  it('sends a change of read or archived state and returns the item as the server stored it', async () => {
    const sent: unknown[] = []
    server.use(
      http.patch('/api/conversations/:id', async ({ params, request }) => {
        sent.push([params.id, await request.json()])
        return HttpResponse.json({ ...API_CONVERSATIONS[0], unreadCount: 0 })
      }),
    )

    const item = await updateConversation('c-1', { read: true })

    expect(sent).toEqual([['c-1', { read: true }]])
    expect(item).toEqual({ ...API_CONVERSATIONS[0], unreadCount: 0, linked: [] })
  })
})
