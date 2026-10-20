import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/problem'
import { API_CONVERSATIONS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { discardMessage, sendMessage, sendSticker } from './inbox.api'
import type { ConversationItem, Message, MessagePage, OpenConversation } from './inbox.types'
import { conversationKey, messagesKey, outboxKey, useSendMessage } from './useInbox'

vi.mock('./inbox.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./inbox.api')>()
  return { ...api, sendMessage: vi.fn(api.sendMessage), sendSticker: vi.fn(api.sendSticker), discardMessage: vi.fn(api.discardMessage) }
})

const now = new Date('2026-10-02T07:05:00Z')
const [first] = API_CONVERSATIONS.map((item) => ({ ...item, snippet: item.snippet ?? '', linked: [] })) as ConversationItem[]
const detail = { id: 'c-1', messages: null, firstUnreadId: null, linked: null, members: null, files: null, canSend: true, replyTo: null, previousCursor: null }
const older: Message = { id: 'm-1', kind: 'MESSAGE', direction: 'IN', sender: 'An', to: null, at: '2026-10-01T02:00:00Z', text: 'Chào', attachments: [], status: null, linked: [] }
type Mail = Message & { kind: 'MESSAGE' }

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData<OpenConversation>(conversationKey('c-1'), { item: first, detail })
  queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(messagesKey('c-1'), { pages: [{ items: [older], nextCursor: null }], pageParams: [null] })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

const outboxOf = (queryClient: QueryClient) => queryClient.getQueryData<Mail[]>(outboxKey('c-1')) ?? []

/** What the server stores for a sticker: the message of the library with the ID the web gave it. */
function stored(stickerId: string, clientMessageId: string, id = 'm-9'): Mail {
  return { id, kind: 'MESSAGE', direction: 'OUT', sender: 'Bạn', to: null, at: now.toISOString(), text: '[Sticker]', attachments: [], status: 'SENT', linked: [], clientMessageId, libraryStickerId: stickerId }
}

interface Attempt {
  stickerId: string
  clientMessageId: string
  answer: (mail: Mail) => void
  refuse: (error: unknown) => void
}

/** A `sendSticker` that waits to be answered, so a test sees which tries have started. */
function held() {
  const tries: Attempt[] = []
  vi.mocked(sendSticker).mockImplementation(
    (_conversationId, stickerId, clientMessageId) =>
      new Promise<Mail>((resolve, reject) => {
        tries.push({ stickerId, clientMessageId, answer: resolve, refuse: reject })
      }),
  )
  return tries
}

describe('sending a sticker of the library', () => {
  beforeEach(() => {
    vi.mocked(sendSticker).mockReset()
    vi.mocked(sendMessage).mockReset()
    vi.mocked(discardMessage).mockReset()
    server.use(http.get('/api/conversations/:id/messages', () => HttpResponse.json({ items: [], nextCursor: null })))
  })

  it('shows the sticker at once as "Đang gửi", then as the server stored it, and updates the row', async () => {
    const tries = held()
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })

    act(() => result.current.sendSticker('lib-1'))

    await waitFor(() => expect(outboxOf(queryClient)).toEqual([expect.objectContaining({ text: '[Sticker]', libraryStickerId: 'lib-1', status: 'SENDING', local: true })]))
    const clientMessageId = outboxOf(queryClient)[0].clientMessageId!
    await waitFor(() => expect(sendSticker).toHaveBeenCalledWith('c-1', 'lib-1', clientMessageId))
    act(() => tries[0].answer(stored('lib-1', clientMessageId)))

    await waitFor(() => expect(outboxOf(queryClient)).toEqual([expect.objectContaining({ id: 'm-9', status: 'SENT', libraryStickerId: 'lib-1', clientMessageId })]))
    expect(queryClient.getQueryData<OpenConversation>(conversationKey('c-1'))?.item).toMatchObject({ snippet: '[Sticker]', lastMessageAt: now.toISOString() })
  })

  it('sends one at a time, in the order they were clicked, each showing at once', async () => {
    const tries = held()
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })

    act(() => {
      result.current.sendSticker('lib-1')
      result.current.sendSticker('lib-2')
      result.current.sendSticker('lib-3')
    })

    await waitFor(() => expect(outboxOf(queryClient).map((mail) => mail.libraryStickerId)).toEqual(['lib-1', 'lib-2', 'lib-3']))
    expect(outboxOf(queryClient).map((mail) => mail.status)).toEqual(['SENDING', 'SENDING', 'SENDING'])
    await waitFor(() => expect(tries).toHaveLength(1))
    expect(tries[0].stickerId).toBe('lib-1')

    act(() => tries[0].answer(stored('lib-1', tries[0].clientMessageId, 'm-1')))
    await waitFor(() => expect(tries).toHaveLength(2))
    expect(tries[1].stickerId).toBe('lib-2')

    act(() => tries[1].answer(stored('lib-2', tries[1].clientMessageId, 'm-2')))
    await waitFor(() => expect(tries).toHaveLength(3))
    expect(tries.map((entry) => entry.stickerId)).toEqual(['lib-1', 'lib-2', 'lib-3'])
  })

  it('goes on with the next sticker when one is refused', async () => {
    const tries = held()
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })
    act(() => {
      result.current.sendSticker('lib-1')
      result.current.sendSticker('lib-2')
    })
    await waitFor(() => expect(tries).toHaveLength(1))

    act(() => tries[0].refuse(new ApiError(502, 'SEND_FAILED', null, [], { messageId: 'm-5' })))

    await waitFor(() => expect(tries).toHaveLength(2))
    expect(outboxOf(queryClient)[0]).toMatchObject({ id: 'm-5', status: 'FAILED', local: false, libraryStickerId: 'lib-1' })
  })

  it('does not hold a text behind the stickers on their way', async () => {
    held()
    vi.mocked(sendMessage).mockResolvedValue({ ...stored('x', 'y'), text: 'Ok nhé' })
    const { wrapper } = setup()
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })
    act(() => result.current.sendSticker('lib-1'))

    act(() => result.current.send('Ok nhé'))

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('c-1', 'Ok nhé', expect.any(String)))
  })

  it('keeps a refused sticker with its sticker, and the same ID sends the same sticker again', async () => {
    const tries = held()
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })
    act(() => result.current.sendSticker('lib-1'))
    await waitFor(() => expect(tries).toHaveLength(1))
    const clientMessageId = tries[0].clientMessageId
    act(() => tries[0].refuse(new ApiError(502, 'SEND_FAILED', null, [], { messageId: 'm-5' })))
    await waitFor(() => expect(outboxOf(queryClient)[0]).toMatchObject({ status: 'FAILED', libraryStickerId: 'lib-1' }))

    act(() => result.current.resend(outboxOf(queryClient)[0]))

    await waitFor(() => expect(tries).toHaveLength(2))
    expect(tries[1]).toMatchObject({ stickerId: 'lib-1', clientMessageId })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(outboxOf(queryClient)[0].status).toBe('SENDING')
  })

  it('says it does not know when the answer never came, and when the server says so', async () => {
    const tries = held()
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })
    act(() => {
      result.current.sendSticker('lib-1')
      result.current.sendSticker('lib-2')
    })
    await waitFor(() => expect(tries).toHaveLength(1))

    act(() => tries[0].refuse(new ApiError(0, 'NETWORK_ERROR', null)))
    await waitFor(() => expect(tries).toHaveLength(2))
    act(() => tries[1].refuse(new ApiError(504, 'SEND_OUTCOME_UNKNOWN', null, [], { messageId: 'm-6' })))

    await waitFor(() => expect(outboxOf(queryClient).map((mail) => mail.status)).toEqual(['UNKNOWN', 'UNKNOWN']))
    expect(outboxOf(queryClient)[0].local).toBe(true)
    expect(outboxOf(queryClient)[1]).toMatchObject({ id: 'm-6', local: false })
  })

  it('throws a refused sticker away in this browser, and on the server when it kept it', async () => {
    const tries = held()
    vi.mocked(discardMessage).mockResolvedValue()
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })
    act(() => result.current.sendSticker('lib-1'))
    await waitFor(() => expect(tries).toHaveLength(1))
    act(() => tries[0].refuse(new ApiError(502, 'SEND_FAILED', null, [], { messageId: 'm-5' })))
    await waitFor(() => expect(outboxOf(queryClient)[0]).toMatchObject({ status: 'FAILED', id: 'm-5' }))

    act(() => result.current.discard(outboxOf(queryClient)[0]))

    expect(outboxOf(queryClient)).toEqual([])
    await waitFor(() => expect(discardMessage).toHaveBeenCalledWith('c-1', 'm-5'))
  })

  it('reads the conversation again when a sticker is not allowed here, so the notice shows', async () => {
    const tries = held()
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSendMessage('c-1'), { wrapper })
    act(() => result.current.sendSticker('lib-1'))
    await waitFor(() => expect(tries).toHaveLength(1))

    act(() => tries[0].refuse(new ApiError(409, 'REPLY_NOT_ALLOWED', null, [], { state: 'NOT_SUPPORTED' })))

    await waitFor(() => expect(outboxOf(queryClient)[0].status).toBe('FAILED'))
    expect(queryClient.getQueryState(conversationKey('c-1'))?.isInvalidated).toBe(true)
  })
})
