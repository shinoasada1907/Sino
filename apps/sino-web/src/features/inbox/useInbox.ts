import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, NETWORK_ERROR } from '@/shared/api/problem'
import { applyChange, countsAfter, type ConversationChange } from './conversationChange'
import { filterConversations, withOutbox, type InboxFilter } from './format'
import { discardMessage, fetchConversation, fetchConversations, fetchInbox, fetchMessageBody, fetchMessages, fetchUnreadCount, sendMessage, updateConversation } from './inbox.api'
import type { ConversationDetail, ConversationItem, ConversationPage, InboxData, Message, MessageBody, MessagePage, OpenConversation } from './inbox.types'

/** Accounts, providers and counts of the inbox. */
export const INBOX_QUERY_KEY = ['inbox'] as const
/** Apart from `['inbox']`: the shell keeps it on every page, and it is one light request (D-93). */
export const INBOX_UNREAD_QUERY_KEY = ['inbox-unread'] as const
const LISTS_KEY = ['inbox', 'list'] as const
/** The pages of one view and source. */
export const conversationsKey = ({ view, source }: InboxFilter) => [...LISTS_KEY, view, source] as const
export const conversationKey = (conversationId: string) => ['inbox', 'conversation', conversationId] as const
/** Under the conversation, so that a change the stream reports reads them again too (D-126). */
export const messagesKey = (conversationId: string) => [...conversationKey(conversationId), 'messages'] as const
/** What this browser sent in a conversation (D-134): outside `['inbox']`, so reading the conversation again keeps it. */
export const outboxKey = (conversationId: string) => ['outbox', conversationId] as const

type Mail = Message & { kind: 'MESSAGE' }

type Lists = InfiniteData<ConversationPage, string | null>
type MessagePages = InfiniteData<MessagePage, string | null>

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

/** The unread conversations for the count of the navigation; undefined until it arrives. */
export function useInboxUnread(): number | undefined {
  const { data } = useQuery({ queryKey: INBOX_UNREAD_QUERY_KEY, queryFn: fetchUnreadCount, staleTime: Infinity })
  return data
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
 * The full content of one email (F06). It never changes, so it is never asked again while it is cached, and it lives
 * outside `['inbox']`: a change the stream reports reads the conversation again, not every email already shown.
 */
export function useMessageBody(conversationId: string, messageId: string, enabled: boolean): {
  body: MessageBody | undefined
  failed: boolean
  retry: () => void
} {
  const { data, isError, refetch } = useQuery({
    queryKey: ['message-body', conversationId, messageId],
    queryFn: () => fetchMessageBody(conversationId, messageId),
    enabled,
    staleTime: Infinity,
  })
  return { body: data, failed: isError, retry: () => void refetch() }
}

/** The messages of the open conversation, apart from its detail (F06). */
export interface MessageHistory {
  /** Until the first page has arrived or failed. */
  loading: boolean
  /** The messages could not load; the start of the newest one shows instead. */
  failed: boolean
  retry: () => void
  /** The older messages, a page at a time ("Xem thư cũ hơn", D-124). */
  older: LoadMore
}

/**
 * One conversation: `listed` (its row in the loaded list) shows at once; the request then brings the row as the server
 * has it and the detail. A conversation of another view or an older page opens too (a link, a reload). Its messages
 * load at the same time, newest page first, and `detail.messages` holds them oldest first (D-126). A backend without
 * the messages API (404) leaves `detail.messages` null, as before F06.
 */
export function useConversation(
  conversationId: string | undefined,
  listed: ConversationItem | undefined,
): {
  item: ConversationItem | undefined
  detail: ConversationDetail | undefined
  history: MessageHistory
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
  const messages = useInfiniteQuery({
    queryKey: messagesKey(conversationId ?? ''),
    queryFn: ({ pageParam }) => fetchMessages(conversationId!, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: conversationId !== undefined,
    staleTime: Infinity,
  })
  // Filled by `useSendMessage` only; kept for the session.
  const { data: outbox } = useQuery<Mail[]>({ queryKey: outboxKey(conversationId ?? ''), queryFn: () => [], enabled: false, gcTime: Infinity })
  const { fetchNextPage } = messages
  const loadOlder = useCallback(() => void fetchNextPage({ cancelRefetch: false }), [fetchNextPage])
  const open = conversationId === undefined ? undefined : data
  // A message can come twice when one arrived between two pages.
  const seen = new Set<string>()
  const loaded = messages.data?.pages
    .flatMap((page) => page.items)
    .filter((message) => !seen.has(message.id) && seen.add(message.id))
    .reverse()
  const failedMessages = messages.error !== null && !messages.isFetchNextPageError && !isMissing(messages.error)
  return {
    item: open?.item ?? listed,
    detail: open && { ...open.detail, messages: loaded ? withOutbox(loaded, outbox ?? []) : open.detail.messages },
    history: {
      loading: conversationId !== undefined && messages.status === 'pending',
      failed: conversationId !== undefined && failedMessages,
      retry: () => void messages.refetch(),
      older: { hasMore: messages.hasNextPage, loading: messages.isFetchingNextPage, failed: messages.isFetchNextPageError, load: loadOlder },
    },
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
// What a reply on its way needs: a resend carries the ID of the first try; `attempt` tells this try from a later one.
interface Outgoing {
  text: string
  clientMessageId: string
  attempt: number
}

const storedId = (error: unknown) => (error instanceof ApiError && typeof error.extra.messageId === 'string' ? error.extra.messageId : null)

/**
 * Sends replies (F10, D-131, D-134). Each message gets a `clientMessageId`; it waits in the outbox of this browser as
 * "Đang gửi". Whatever the answer, the list of the server is read again, and once it has the message the outbox lets
 * go of it. A refused send stays with "Gửi lại" (same ID) and "Bỏ"; one whose fate is unknown says so, and when the
 * answer never came (the network) it may be sent again safely; "not allowed" reads the conversation again so its
 * notice shows. Offline, TanStack Query holds the send until the network is back.
 */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()
  const editOutbox = (change: (mails: Mail[]) => Mail[]) => queryClient.setQueryData<Mail[]>(outboxKey(conversationId), (mails = []) => change(mails))
  const editMail = (clientMessageId: string, change: (mail: Mail) => Mail) =>
    editOutbox((mails) => mails.map((mail) => (mail.clientMessageId === clientMessageId ? change(mail) : mail)))
  // The latest try of each message: an older try that ends late must not let go of a newer one.
  const attempts = useRef(new Map<string, number>())

  const mutation = useMutation({
    mutationFn: ({ text, clientMessageId }: Outgoing) => sendMessage(conversationId, text, clientMessageId),
    onMutate: ({ text, clientMessageId }: Outgoing) => {
      const pending: Mail = {
        id: `local-${clientMessageId}`,
        kind: 'MESSAGE',
        direction: 'OUT',
        sender: 'Bạn',
        to: null,
        at: new Date().toISOString(),
        text,
        attachments: [],
        status: 'SENDING',
        linked: [],
        clientMessageId,
        local: true,
      }
      editOutbox((mails) =>
        mails.some((mail) => mail.clientMessageId === clientMessageId)
          ? mails.map((mail) => (mail.clientMessageId === clientMessageId ? { ...mail, status: 'SENDING' } : mail))
          : [...mails, pending],
      )
    },
    onSuccess: (sent, { clientMessageId }) => {
      editMail(clientMessageId, () => ({ ...sent, clientMessageId }))
      updateItem(queryClient, conversationId, (item) => ({
        ...item,
        snippet: sent.kind === 'MESSAGE' ? sent.text : item.snippet,
        snippetFrom: item.memberCount ? 'Bạn' : null,
        lastMessageAt: sent.at,
      }))
    },
    onError: (error, { clientMessageId }) => {
      const code = error instanceof ApiError ? error.code : null
      if (code === 'SEND_IN_PROGRESS') {
        // Another try with this ID is still running; the server's copy tells how it ends (see onSettled).
        return
      }
      const id = storedId(error)
      // No answer at all: the request may have reached the server, so it is not "Không gửi được" (D-132).
      const unknown = code === 'SEND_OUTCOME_UNKNOWN' || code === NETWORK_ERROR
      editMail(clientMessageId, (mail) => ({ ...mail, status: unknown ? 'UNKNOWN' : 'FAILED', ...(id ? { id, local: false } : {}) }))
      if (code === 'REPLY_NOT_ALLOWED') {
        void queryClient.invalidateQueries({ queryKey: conversationKey(conversationId), exact: true })
      }
    },
    onSettled: async (_sent, _error, { clientMessageId, attempt }) => {
      await queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) })
      const pages = queryClient.getQueryData<MessagePages>(messagesKey(conversationId))
      const stored = pages?.pages.some((page) => page.items.some((message) => message.kind === 'MESSAGE' && message.clientMessageId === clientMessageId))
      if (stored && attempts.current.get(clientMessageId) === attempt) {
        editOutbox((mails) => mails.filter((mail) => mail.clientMessageId !== clientMessageId))
      }
    },
  })

  const discarding = useMutation({
    mutationFn: (mail: Mail) => discardMessage(conversationId, mail.id),
    onMutate: async (mail: Mail) => {
      // A reading in flight would bring the message back.
      await queryClient.cancelQueries({ queryKey: messagesKey(conversationId) })
      queryClient.setQueryData<MessagePages>(
        messagesKey(conversationId),
        (data) => data && { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((message) => message.id !== mail.id) })) },
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) }),
  })
  const sendTry = (text: string, clientMessageId: string) => {
    const attempt = (attempts.current.get(clientMessageId) ?? 0) + 1
    attempts.current.set(clientMessageId, attempt)
    mutation.mutate({ text, clientMessageId, attempt })
  }

  return {
    send: (text: string) => sendTry(text, crypto.randomUUID()),
    resend: (mail: Mail) => {
      if (mail.clientMessageId) {
        sendTry(mail.text, mail.clientMessageId)
      }
    },
    /** Throws away a failed reply: in this browser only, or on the server too when it kept it. */
    discard: (mail: Mail) => {
      editOutbox((mails) => mails.filter((entry) => entry.clientMessageId !== mail.clientMessageId))
      if (!mail.local) {
        discarding.mutate(mail)
      }
    },
    /** The `clientMessageId` of the reply the server refused to throw away, if the last try failed. */
    discardFailed: discarding.isError ? discarding.variables?.clientMessageId : undefined,
  }
}
