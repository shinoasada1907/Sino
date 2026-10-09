import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { API_CONVERSATIONS, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { sendMessage } from './inbox.api'
import type { ConversationItem, ConversationPage, InboxData, OpenConversation } from './inbox.types'
import { conversationKey, conversationsKey, INBOX_QUERY_KEY, useConversation, useConversationList, useSendMessage, useUpdateConversation } from './useInbox'

vi.mock('./inbox.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./inbox.api')>()
  return { ...api, sendMessage: vi.fn(api.sendMessage) }
})

const now = new Date('2026-10-02T07:05:00Z')
const ALL = { view: 'all', source: null } as const
const [first, second] = API_CONVERSATIONS.map((item) => ({ ...item, snippet: item.snippet ?? '', linked: [] })) as ConversationItem[]
const FRAME: InboxData = {
  generatedAt: now.toISOString(),
  providers: [{ type: 'gmail', displayName: 'Gmail' }],
  accounts: [{ id: 'acc-1', provider: 'gmail', externalAccountId: 'an.nguyen@gmail.com', status: 'CONNECTED', syncProgress: null, statusChangedAt: null }],
  counts: { unread: 1, byProvider: [{ provider: 'gmail', unread: 1 }], needsReply: 1, withAttachments: 1, scheduled: 0, snoozed: 0 },
}
const NOT_FOUND = { title: 'Not found', status: 404, code: 'CONVERSATION_NOT_FOUND' }
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

function setup({ list = [first, second] }: { list?: ConversationItem[] | null } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData(INBOX_QUERY_KEY, FRAME)
  if (list) {
    queryClient.setQueryData(conversationsKey(ALL), { pages: [{ items: list, nextCursor: null }], pageParams: [null] })
  }
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

const rowsOf = (queryClient: QueryClient) =>
  queryClient.getQueryData<{ pages: ConversationPage[] }>(conversationsKey(ALL))!.pages.flatMap((page) => page.items)

describe('useConversationList', () => {
  it('loads the first page of a view, then the next one with its cursor, until there is none', async () => {
    const asked: string[] = []
    server.use(
      http.get('/api/conversations', ({ request }) => {
        const search = new URL(request.url).search
        asked.push(search)
        return search.includes('cursor=')
          ? HttpResponse.json({ items: [API_CONVERSATIONS[1]], nextCursor: null })
          : HttpResponse.json({ items: [API_CONVERSATIONS[0]], nextCursor: 'p2' })
      }),
    )
    const { wrapper } = setup({ list: null })
    const { result } = renderHook(() => useConversationList(ALL, now), { wrapper })

    expect(result.current.conversations).toBeUndefined()
    await waitFor(() => expect(result.current.conversations?.map((item) => item.id)).toEqual(['c-1']))
    expect(result.current.more.hasMore).toBe(true)

    act(() => result.current.more.load())

    await waitFor(() => expect(result.current.conversations?.map((item) => item.id)).toEqual(['c-1', 'c-2']))
    expect(result.current.more.hasMore).toBe(false)
    expect(asked).toEqual(['?view=all', '?view=all&cursor=p2'])
  })

  it('says when the next page cannot load, and loads it on retry', async () => {
    let fail = true
    server.use(
      http.get('/api/conversations', ({ request }) => {
        if (!new URL(request.url).searchParams.has('cursor')) {
          return HttpResponse.json({ items: [API_CONVERSATIONS[0]], nextCursor: 'p2' })
        }
        return fail ? problem({ title: 'Down', status: 503, code: 'HTTP_503' }, 503) : HttpResponse.json({ items: [API_CONVERSATIONS[1]], nextCursor: null })
      }),
    )
    const { wrapper } = setup({ list: null })
    const { result } = renderHook(() => useConversationList(ALL, now), { wrapper })
    await waitFor(() => expect(result.current.more.hasMore).toBe(true))

    act(() => result.current.more.load())
    await waitFor(() => expect(result.current.more.failed).toBe(true))
    expect(result.current.conversations).toHaveLength(1)
    // The loaded rows stay: only the end of the list says it failed.
    expect(result.current.error).toBeNull()

    fail = false
    act(() => result.current.more.load())
    await waitFor(() => expect(result.current.conversations).toHaveLength(2))
    expect(result.current.more.failed).toBe(false)
  })
})

describe('useConversationList, when the list changed between two pages', () => {
  it('shows a row that comes on two pages once', async () => {
    server.use(
      http.get('/api/conversations', ({ request }) =>
        new URL(request.url).searchParams.has('cursor')
          ? HttpResponse.json({ items: [API_CONVERSATIONS[0], API_CONVERSATIONS[1]], nextCursor: null })
          : HttpResponse.json({ items: [API_CONVERSATIONS[0]], nextCursor: 'p2' }),
      ),
    )
    const { wrapper } = setup({ list: null })
    const { result } = renderHook(() => useConversationList(ALL, now), { wrapper })
    await waitFor(() => expect(result.current.more.hasMore).toBe(true))

    act(() => result.current.more.load())

    await waitFor(() => expect(result.current.conversations?.map((item) => item.id)).toEqual(['c-1', 'c-2']))
  })
})

describe('useConversation', () => {
  it('shows the row of the list at once, then the row and the people the server gives', async () => {
    server.use(http.get('/api/conversations/:id', () => HttpResponse.json({ ...API_CONVERSATIONS[0], title: 'Minh Anh', participants: API_PARTICIPANTS })))
    const { wrapper } = setup()
    const { result } = renderHook(() => useConversation('c-1', first), { wrapper })

    expect(result.current.item?.title).toBe('Trần Minh Anh')
    expect(result.current.detail).toBeUndefined()
    await waitFor(() => expect(result.current.item?.title).toBe('Minh Anh'))
    expect(result.current.detail?.members).toHaveLength(2)
    expect(result.current.notFound).toBe(false)
  })

  it('reports a conversation the server does not know as not found', async () => {
    server.use(http.get('/api/conversations/:id', () => problem(NOT_FOUND, 404)))
    const { wrapper } = setup()
    const { result } = renderHook(() => useConversation('c-9', undefined), { wrapper })

    await waitFor(() => expect(result.current.notFound).toBe(true))
    expect(result.current.failed).toBe(false)
  })

  it('tells a failure apart from a missing conversation', async () => {
    server.use(http.get('/api/conversations/:id', () => problem({ title: 'Down', status: 503, code: 'HTTP_503' }, 503)))
    const { wrapper } = setup()
    const { result } = renderHook(() => useConversation('c-1', undefined), { wrapper })

    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.notFound).toBe(false)
  })

  it('asks for nothing while no conversation is open', () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useConversation(undefined, undefined), { wrapper })
    expect(result.current).toMatchObject({ item: undefined, detail: undefined, notFound: false, failed: false })
  })
})

describe('useUpdateConversation', () => {
  it('reads a conversation at once in the list, the open conversation and the counts, then keeps what the server stored', async () => {
    let answer: (() => void) | undefined
    const sent: unknown[] = []
    server.use(
      http.patch('/api/conversations/:id', async ({ params, request }) => {
        sent.push([params.id, await request.json()])
        await new Promise<void>((resolve) => (answer = resolve))
        return HttpResponse.json({ ...API_CONVERSATIONS[0], unreadCount: 0, needsReply: false })
      }),
    )
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData<OpenConversation>(conversationKey('c-1'), { item: first, detail: { id: 'c-1', messages: null, firstUnreadId: null, linked: null, members: [], files: null, canSend: null, previousCursor: null } })
    const { result } = renderHook(() => useUpdateConversation(), { wrapper })

    act(() => result.current.mutate({ id: 'c-1', change: { read: true } }))

    await waitFor(() => expect(rowsOf(queryClient)[0].unreadCount).toBe(0))
    expect(queryClient.getQueryData<OpenConversation>(conversationKey('c-1'))?.item.unreadCount).toBe(0)
    expect(queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)?.counts).toMatchObject({ unread: 0, byProvider: [{ provider: 'gmail', unread: 0 }], needsReply: 1 })

    await waitFor(() => expect(answer).toBeDefined())
    answer!()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sent).toEqual([['c-1', { read: true }]])
    // The server knows better (here it also cleared "needs reply"): its row and the counts follow it.
    expect(rowsOf(queryClient)[0].needsReply).toBe(false)
    expect(queryClient.getQueryData<OpenConversation>(conversationKey('c-1'))?.item.needsReply).toBe(false)
    expect(queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)?.counts.needsReply).toBe(0)
    // Reading moves no conversation to another view, so no list has to load again.
    expect(queryClient.getQueryState(conversationsKey(ALL))?.isInvalidated).toBe(false)
  })

  it('archives: the row leaves the inbox at once, the counts drop, and every list loads again when it is next shown', async () => {
    server.use(http.patch('/api/conversations/:id', () => HttpResponse.json({ ...API_CONVERSATIONS[0], archived: true })))
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => ({ list: useConversationList(ALL, now), update: useUpdateConversation() }), { wrapper })

    act(() => result.current.update.mutate({ id: 'c-1', change: { archived: true } }))

    await waitFor(() => expect(result.current.list.conversations?.map((item) => item.id)).toEqual(['c-2']))
    expect(queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)?.counts).toMatchObject({ unread: 0, needsReply: 0, withAttachments: 0 })
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true))
    expect(queryClient.getQueryState(conversationsKey(ALL))?.isInvalidated).toBe(true)
  })

  it('puts the row and the counts back when the server refuses', async () => {
    server.use(http.patch('/api/conversations/:id', () => problem(NOT_FOUND, 404)))
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useUpdateConversation(), { wrapper })

    act(() => result.current.mutate({ id: 'c-1', change: { archived: true } }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(rowsOf(queryClient)[0]).toEqual(first)
    expect(queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)?.counts).toEqual(FRAME.counts)
  })
})

describe('useSendMessage', () => {
  const detail = { id: 'c-1', messages: [], firstUnreadId: null, linked: null, members: null, files: null, canSend: true, previousCursor: null }

  it('adds the message as "Đang gửi", then shows it as sent in the conversation and the row', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({ id: 'm-9', kind: 'MESSAGE', direction: 'OUT', sender: 'Bạn', to: null, at: now.toISOString(), text: 'Ok nhé', attachments: [], status: 'SENT', linked: [] })
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData<OpenConversation>(conversationKey('c-1'), { item: first, detail })
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })

    act(() => result.current.mutate('Ok nhé'))
    await waitFor(() => expect(queryClient.getQueryData<OpenConversation>(conversationKey('c-1'))?.detail.messages).toHaveLength(1))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const open = queryClient.getQueryData<OpenConversation>(conversationKey('c-1'))!
    expect(open.detail.messages).toEqual([expect.objectContaining({ id: 'm-9', status: 'SENT' })])
    expect(open.item).toMatchObject({ snippet: 'Ok nhé', lastMessageAt: now.toISOString() })
    expect(rowsOf(queryClient)[0]).toMatchObject({ snippet: 'Ok nhé', snippetFrom: null, lastMessageAt: now.toISOString() })
  })

  it('marks the message as not sent when sending fails', async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error('offline'))
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData<OpenConversation>(conversationKey('c-1'), { item: first, detail })
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })

    act(() => result.current.mutate('Ok nhé'))
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(queryClient.getQueryData<OpenConversation>(conversationKey('c-1'))?.detail.messages).toEqual([expect.objectContaining({ text: 'Ok nhé', status: 'FAILED' })])
  })
})
