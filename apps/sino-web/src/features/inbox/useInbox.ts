import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ShellData } from '@/app/shell/shell.types'
import { SHELL_QUERY_KEY } from '@/app/shell/useShellData'
import type { OverviewData } from '@/features/overview/overview.types'
import { OVERVIEW_QUERY_KEY } from '@/features/overview/useOverview'
import { fetchConversation, fetchInbox, markRead, sendMessage } from './inbox.api'
import type { ConversationDetail, ConversationItem, InboxData, Message } from './inbox.types'

export const INBOX_QUERY_KEY = ['inbox'] as const
export const conversationKey = (conversationId: string) => ['inbox', conversationId] as const

/** The inbox list, and when it arrived (milliseconds since the epoch, 0 before any data). */
export function useInbox(): { inbox: InboxData | undefined; receivedAt: number } {
  const { data, dataUpdatedAt } = useQuery({ queryKey: INBOX_QUERY_KEY, queryFn: fetchInbox, staleTime: Infinity })
  return { inbox: data, receivedAt: dataUpdatedAt }
}

/**
 * One conversation. Its row (title, source, unread count) comes from the list, so a change shows on both; its messages
 * load on their own. `notFound` is true once the list has no such id.
 */
export function useConversation(conversationId: string): {
  inbox: InboxData | undefined
  item: ConversationItem | undefined
  detail: ConversationDetail | undefined
  notFound: boolean
  receivedAt: number
} {
  const { inbox, receivedAt } = useInbox()
  const item = inbox?.conversations.find((conversation) => conversation.id === conversationId)
  const { data: detail } = useQuery({
    queryKey: conversationKey(conversationId),
    queryFn: () => fetchConversation(conversationId),
    staleTime: Infinity,
    enabled: item !== undefined,
  })
  return { inbox, item, detail, notFound: inbox !== undefined && item === undefined, receivedAt }
}

/**
 * Marks a conversation as read when it opens: its row and every count of unread messages (the list, its source, the
 * navigation and the overview) lose its unread messages at once.
 */
export function useMarkRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markRead,
    onMutate: (conversationId: string) => {
      const inbox = queryClient.getQueryData<InboxData>(INBOX_QUERY_KEY)
      const item = inbox?.conversations.find((conversation) => conversation.id === conversationId)
      const read = item?.unreadCount ?? 0
      if (!inbox || !item || read === 0) {
        return
      }
      queryClient.setQueryData<InboxData>(INBOX_QUERY_KEY, {
        ...inbox,
        conversations: inbox.conversations.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
        ),
        counts: {
          ...inbox.counts,
          unread: Math.max(0, inbox.counts.unread - read),
          byProvider: inbox.counts.byProvider.map((entry) =>
            entry.provider === item.provider ? { ...entry, unread: Math.max(0, entry.unread - read) } : entry,
          ),
        },
      })
      queryClient.setQueryData<ShellData>(SHELL_QUERY_KEY, (shell) =>
        shell && { ...shell, navCounts: { ...shell.navCounts, inboxUnread: Math.max(0, shell.navCounts.inboxUnread - read) } },
      )
      queryClient.setQueryData<OverviewData>(OVERVIEW_QUERY_KEY, (overview) =>
        overview?.inbox
          ? {
              ...overview,
              inbox: {
                ...overview.inbox,
                unreadCount: Math.max(0, overview.inbox.unreadCount - read),
                bySource: overview.inbox.bySource.map((entry) =>
                  entry.provider === item.provider ? { ...entry, unreadCount: Math.max(0, entry.unreadCount - read) } : entry,
                ),
                conversations: overview.inbox.conversations.map((conversation) =>
                  conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
                ),
              },
            }
          : overview,
      )
    },
  })
}

/**
 * Sends a message. It shows at once at the end of the conversation as "Đang gửi", becomes the stored message when the
 * server answers (and the row's preview), or is marked "Không gửi được" when sending fails.
 */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()
  const setMessages = (change: (messages: Message[]) => Message[]) =>
    queryClient.setQueryData<ConversationDetail>(conversationKey(conversationId), (detail) => detail && { ...detail, messages: change(detail.messages) })

  return useMutation({
    mutationFn: (text: string) => sendMessage(conversationId, text),
    onMutate: (text: string) => {
      const pending: Message = {
        id: crypto.randomUUID(),
        kind: 'MESSAGE',
        direction: 'OUT',
        sender: 'Bạn',
        to: null,
        at: new Date().toISOString(),
        text,
        attachments: [],
        status: 'SENDING',
        linked: [],
      }
      setMessages((messages) => [...messages, pending])
      return { pendingId: pending.id }
    },
    onSuccess: (sent, _text, context) => {
      setMessages((messages) => messages.map((message) => (message.id === context.pendingId ? sent : message)))
      queryClient.setQueryData<InboxData>(INBOX_QUERY_KEY, (inbox) =>
        inbox && {
          ...inbox,
          conversations: inbox.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  snippet: sent.kind === 'MESSAGE' ? sent.text : conversation.snippet,
                  snippetFrom: conversation.memberCount ? 'Bạn' : null,
                  lastMessageAt: sent.at,
                }
              : conversation,
          ),
        },
      )
    },
    onError: (_error, _text, context) => {
      setMessages((messages) =>
        messages.map((message) => (message.id === context?.pendingId && message.kind === 'MESSAGE' ? { ...message, status: 'FAILED' } : message)),
      )
    },
  })
}
