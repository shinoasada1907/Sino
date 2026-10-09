import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '@/shared/api/problem'
import { applyChange, countsAfter, type ConversationChange } from './conversationChange'
import { filterConversations, type InboxFilter } from './format'
import { fetchConversation, fetchConversations, fetchInbox, sendMessage, updateConversation } from './inbox.api'
import type { ConversationDetail, ConversationItem, ConversationPage, InboxData, Message, OpenConversation } from './inbox.types'

/** Accounts, providers and counts of the inbox. */
export const INBOX_QUERY_KEY = ['inbox'] as const
const LISTS_KEY = ['inbox', 'list'] as const
/** The pages of one view and source. */
export const conversationsKey = ({ view, source }: InboxFilter) => [...LISTS_KEY, view, source] as const
export const conversationKey = (conversationId: string) => ['inbox', 'conversation', conversationId] as const

type Lists = InfiniteData<ConversationPage, string | null>

export interface InboxQuery {
  inbox: InboxData | undefined
  /** When the data arrived (milliseconds since the epoch, 0 before any data). */
  receivedAt: number
  /** Why the last load failed; the page shows it only while there is no data. */
  error: Error | null
  /** When `error` happened. */
  failedAt: number
  retry: () => void
}

export function useInbox(): InboxQuery {
  const { data, dataUpdatedAt, error, errorUpdatedAt, refetch } = useQuery({ queryKey: INBOX_QUERY_KEY, queryFn: fetchInbox, staleTime: Infinity })
  return { inbox: data, receivedAt: dataUpdatedAt, error, failedAt: errorUpdatedAt, retry: () => void refetch() }
}

/** The end of a list: whether there is more, and loading it (infinite scroll, or the button when there is no scrolling). */
export interface LoadMore {
  hasMore: boolean
  loading: boolean
  failed: boolean
  load: () => void
}

export interface ConversationListQuery {
  /** The rows to show, newest first; undefined until the first page of any view has arrived. */
  conversations: ConversationItem[] | undefined
  /** Every loaded row of the view, shown or not: an open conversation takes its row from here before its own request. */
  loaded: ConversationItem[]
  /** True while the rows still belong to the view shown before. */
  switching: boolean
  error: Error | null
  failedAt: number
  retry: () => void
  more: LoadMore
}

/**
 * The conversations of one view and source, a page at a time (keyset, `nextCursor`). The server filters; the loaded rows
 * are filtered again here so that a change (read, archived) shows at once, and the rows of the view shown before stay
 * while the new one loads.
 */
export function useConversationList(filter: InboxFilter, now: Date): ConversationListQuery {
  const query = useInfiniteQuery({
    queryKey: conversationsKey(filter),
    queryFn: ({ pageParam }) => fetchConversations(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
  const { data, isPlaceholderData, error, errorUpdatedAt, refetch, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query
  // Stable, so the end of the list watches its button once rather than on every render.
  const load = useCallback(() => void fetchNextPage({ cancelRefetch: false }), [fetchNextPage])
  // A row can come twice when the list changed between two pages.
  const seen = new Set<string>()
  const loaded = (data?.pages.flatMap((page) => page.items) ?? []).filter((item) => !seen.has(item.id) && seen.add(item.id))
  return {
    conversations: data && filterConversations(loaded, filter, now),
    loaded,
    switching: isPlaceholderData,
    // A failed next page keeps the loaded rows; `more.failed` tells it.
    error: isFetchNextPageError ? null : error,
    failedAt: errorUpdatedAt,
    retry: () => void refetch(),
    more: {
      // While the rows of the view before are shown, TanStack already says there is no next page.
      hasMore: hasNextPage,
      loading: isFetchingNextPage,
      failed: isFetchNextPageError,
      load,
    },
  }
}

const isMissing = (error: Error | null) => error instanceof ApiError && (error.status === 404 || error.status === 400)

/**
 * One conversation: `listed` (its row in the loaded list) shows at once; the request then brings the row as the server
 * has it and the detail. A conversation of another view or an older page opens too (a link, a reload).
 */
export function useConversation(
  conversationId: string | undefined,
  listed: ConversationItem | undefined,
): {
  item: ConversationItem | undefined
  detail: ConversationDetail | undefined
  notFound: boolean
  failed: boolean
  retry: () => void
} {
  const { data, error, refetch } = useQuery({
    queryKey: conversationKey(conversationId ?? ''),
    queryFn: () => fetchConversation(conversationId!),
    enabled: conversationId !== undefined,
    staleTime: Infinity,
  })
  const open = conversationId === undefined ? undefined : data
  return {
    item: open?.item ?? listed,
    detail: open?.detail,
    notFound: conversationId !== undefined && isMissing(error),
    failed: conversationId !== undefined && error !== null && !isMissing(error),
    retry: () => void refetch(),
  }
}

// The row wherever it is cached: the open conversation first, then any loaded list.
function cachedItem(queryClient: QueryClient, conversationId: string): ConversationItem | undefined {
  const open = queryClient.getQueryData<OpenConversation>(conversationKey(conversationId))
  if (open) {
    return open.item
  }
  for (const [, lists] of queryClient.getQueriesData<Lists>({ queryKey: LISTS_KEY })) {
    const item = lists?.pages.flatMap((page) => page.items).find((entry) => entry.id === conversationId)
    if (item) {
      return item
    }
  }
  return undefined
}

function updateItem(queryClient: QueryClient, conversationId: string, change: (item: ConversationItem) => ConversationItem) {
  queryClient.setQueriesData<Lists>(
    { queryKey: LISTS_KEY },
    (lists) =>
      lists && {
        ...lists,
        pages: lists.pages.map((page) => ({ ...page, items: page.items.map((item) => (item.id === conversationId ? change(item) : item)) })),
      },
  )
  queryClient.setQueryData<OpenConversation>(conversationKey(conversationId), (open) => open && { ...open, item: change(open.item) })
}

function moveCounts(queryClient: QueryClient, before: ConversationItem, after: ConversationItem) {
  queryClient.setQueryData<InboxData>(INBOX_QUERY_KEY, (inbox) => inbox && { ...inbox, counts: countsAfter(inbox.counts, before, after) })
}

/**
 * Reads, marks unread, archives or brings back a conversation (D-67). The row and the counts change at once and go back
 * if the server refuses; the server's row then replaces the guess. A change that moves the conversation to another view
 * (archived, unread) leaves every list to load again the next time it is shown.
 */
export function useUpdateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: ConversationChange }) => updateConversation(id, change),
    onMutate: ({ id, change }) => {
      const saved: [QueryKey, unknown][] = queryClient.getQueriesData({ queryKey: INBOX_QUERY_KEY })
      const before = cachedItem(queryClient, id)
      const guess = before && applyChange(before, change)
      if (before && guess) {
        updateItem(queryClient, id, () => guess)
        moveCounts(queryClient, before, guess)
      }
      return { saved, guess }
    },
    onSuccess: (stored, { id }, { guess }) => {
      if (guess) {
        moveCounts(queryClient, guess, stored)
      }
      updateItem(queryClient, id, () => stored)
    },
    onError: (_error, _variables, context) => {
      context?.saved.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: (_stored, _error, { change }) => {
      if (change.archived !== undefined || change.read === false) {
        void queryClient.invalidateQueries({ queryKey: LISTS_KEY, refetchType: 'none' })
      }
    },
  })
}

/**
 * "Đánh dấu chưa đọc" and "Lưu trữ" / "Bỏ lưu trữ" of an open conversation: the change, then back to the list it came
 * from, as Gmail does (D-73). Staying would read it again at once (opening reads), and an archived row has left the list.
 */
export function useConversationActions(item: ConversationItem, backSearch: string) {
  const { mutate } = useUpdateConversation()
  const navigate = useNavigate()
  const change = (change: ConversationChange) => {
    mutate({ id: item.id, change })
    void navigate({ pathname: '/inbox', search: backSearch })
  }
  return { markUnread: () => change({ read: false }), toggleArchive: () => change({ archived: !item.archived }) }
}

/**
 * Sends a message. It shows at once at the end of the conversation as "Đang gửi", becomes the stored message when the
 * server answers (and the row's preview), or is marked "Không gửi được" when sending fails.
 */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()
  const setMessages = (change: (messages: Message[]) => Message[]) =>
    queryClient.setQueryData<OpenConversation>(
      conversationKey(conversationId),
      (open) => open && { ...open, detail: { ...open.detail, messages: open.detail.messages && change(open.detail.messages) } },
    )

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
      updateItem(queryClient, conversationId, (item) => ({
        ...item,
        snippet: sent.kind === 'MESSAGE' ? sent.text : item.snippet,
        snippetFrom: item.memberCount ? 'Bạn' : null,
        lastMessageAt: sent.at,
      }))
    },
    onError: (_error, _text, context) => {
      setMessages((messages) =>
        messages.map((message) => (message.id === context?.pendingId && message.kind === 'MESSAGE' ? { ...message, status: 'FAILED' } : message)),
      )
    },
  })
}
