import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import type { ShellData } from '@/app/shell/shell.types'
import { SHELL_QUERY_KEY } from '@/app/shell/useShellData'
import { createOverviewSample } from '@/features/overview/overview.sample'
import type { OverviewData } from '@/features/overview/overview.types'
import { OVERVIEW_QUERY_KEY } from '@/features/overview/useOverview'
import { sendMessage } from './inbox.api'
import { createConversationSample, createInboxSample } from './inbox.sample'
import type { ConversationDetail, InboxData } from './inbox.types'
import { conversationKey, INBOX_QUERY_KEY, useConversation, useMarkRead, useSendMessage } from './useInbox'

vi.mock('./inbox.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./inbox.api')>()
  return { ...api, sendMessage: vi.fn(api.sendMessage) }
})

const now = new Date('2026-10-02T07:05:00Z')

function setup({ detail }: { detail?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData(INBOX_QUERY_KEY, createInboxSample(now))
  queryClient.setQueryData(SHELL_QUERY_KEY, createShellSample(now))
  queryClient.setQueryData(OVERVIEW_QUERY_KEY, createOverviewSample(now))
  if (detail) {
    queryClient.setQueryData(conversationKey(detail), createConversationSample(detail, now))
  }
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

const listItem = (data: InboxData, id: string) => data.conversations.find((item) => item.id === id)!

describe('useConversation', () => {
  it('takes the conversation from the list and loads its messages', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useConversation('conv-1'), { wrapper })
    expect(result.current.item?.title).toBe('Trần Minh Anh')
    expect(result.current.notFound).toBe(false)
    await waitFor(() => expect(result.current.detail?.messages).toHaveLength(3))
  })

  it('reports an unknown conversation as not found', () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useConversation('conv-nope'), { wrapper })
    expect(result.current.notFound).toBe(true)
  })
})

describe('useMarkRead', () => {
  it('clears the unread messages of a conversation everywhere they are counted', async () => {
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useMarkRead(), { wrapper })

    await act(() => result.current.mutateAsync('conv-2'))

    const inbox = queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)!
    expect(listItem(inbox, 'conv-2').unreadCount).toBe(0)
    expect(listItem(inbox, 'conv-1').unreadCount).toBe(1)
    expect(inbox.counts.unread).toBe(9)
    expect(inbox.counts.byProvider.find((entry) => entry.provider === 'zalo')?.unread).toBe(1)
    expect(inbox.counts.byProvider.find((entry) => entry.provider === 'gmail')?.unread).toBe(7)
    expect(queryClient.getQueryData<ShellData>(SHELL_QUERY_KEY)!.navCounts.inboxUnread).toBe(9)
    const overview = queryClient.getQueryData<OverviewData>(OVERVIEW_QUERY_KEY)!.inbox!
    expect(overview.unreadCount).toBe(9)
    expect(overview.bySource.find((entry) => entry.provider === 'zalo')?.unreadCount).toBe(1)
    expect(overview.conversations.find((entry) => entry.id === 'conv-2')?.unreadCount).toBe(0)
  })

  it('changes nothing for a conversation already read', async () => {
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useMarkRead(), { wrapper })

    await act(() => result.current.mutateAsync('conv-4'))

    expect(queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)!.counts.unread).toBe(12)
    expect(queryClient.getQueryData<ShellData>(SHELL_QUERY_KEY)!.navCounts.inboxUnread).toBe(12)
  })
})

describe('useSendMessage', () => {
  it('shows the message at once as sending, then as sent, and moves it into the list', async () => {
    const { queryClient, wrapper } = setup({ detail: 'conv-2' })
    const { result } = renderHook(() => useSendMessage('conv-2'), { wrapper })
    const messages = () => queryClient.getQueryData<ConversationDetail>(conversationKey('conv-2'))!.messages

    act(() => result.current.mutate('Con về lúc 6 giờ'))

    await waitFor(() => expect(messages().at(-1)).toMatchObject({ text: 'Con về lúc 6 giờ', status: 'SENDING', direction: 'OUT' }))
    await waitFor(() => expect(messages().at(-1)).toMatchObject({ text: 'Con về lúc 6 giờ', status: 'SENT' }))
    expect(messages().filter((message) => message.kind === 'MESSAGE' && message.text === 'Con về lúc 6 giờ')).toHaveLength(1)
    const item = listItem(queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)!, 'conv-2')
    expect(item).toMatchObject({ snippet: 'Con về lúc 6 giờ', snippetFrom: 'Bạn' })
    expect(item.lastMessageAt).toBe(messages().at(-1)!.at)
  })

  it('a one-to-one message has no sender in the list preview', async () => {
    const { queryClient, wrapper } = setup({ detail: 'conv-1' })
    const { result } = renderHook(() => useSendMessage('conv-1'), { wrapper })

    await act(() => result.current.mutateAsync('Anh đồng ý.'))

    expect(listItem(queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)!, 'conv-1')).toMatchObject({ snippet: 'Anh đồng ý.', snippetFrom: null })
  })

  it('marks the message as not sent when sending fails, and leaves the list as it was', async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error('offline'))
    const { queryClient, wrapper } = setup({ detail: 'conv-2' })
    const { result } = renderHook(() => useSendMessage('conv-2'), { wrapper })

    await act(() => result.current.mutateAsync('Alo').catch(() => undefined))

    const last = queryClient.getQueryData<ConversationDetail>(conversationKey('conv-2'))!.messages.at(-1)
    expect(last).toMatchObject({ text: 'Alo', status: 'FAILED' })
    expect(listItem(queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)!, 'conv-2').snippetFrom).toBe('Hà')
  })
})
