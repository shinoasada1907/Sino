import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, NETWORK_ERROR } from '@/shared/api/problem'
import type { ProviderKind } from '@/shared/domain'
import { applyChange, countsAfter, type ConversationChange } from './conversationChange'
import { filterConversations, withOutbox, type InboxFilter } from './format'
import { stickerTurns } from './stickerQueue'
import { createConversation, discardMessage, fetchConversation, fetchConversations, fetchInbox, fetchMessageBody, fetchMessages, fetchUnreadByKind, sendMessage, sendSticker, updateConversation } from './inbox.api'
import type { ConversationDetail, ConversationItem, ConversationPage, InboxData, Message, MessageBody, MessagePage, OpenConversation, UnreadByKind } from './inbox.types'
import { LEAVE_FREELY, rememberSender, type NewMailDraft } from './newMail'
import { SCREENS } from './screen'

/** Everything of Tin nhắn and Hộp thư: frames, lists, open conversations; what the stream reads again. */
export const INBOX_QUERY_KEY = ['inbox'] as const
const FRAMES_KEY = ['inbox', 'frame'] as const
/** Accounts, providers and the counts of one screen (f05c): each kind has its own counts. */
export const inboxKey = (kind: ProviderKind) => [...FRAMES_KEY, kind] as const
/** Apart from `['inbox']`: the shell keeps it on every page, and it is one light request (D-93). */
export const INBOX_UNREAD_QUERY_KEY = ['inbox-unread'] as const
const LISTS_KEY = ['inbox', 'list'] as const
/** The pages of one kind, view and source. */
export const conversationsKey = (kind: ProviderKind, { view, source }: InboxFilter) => [...LISTS_KEY, kind, view, source] as const
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

/** The unread conversations of Tin nhắn and Hộp thư for the navigation (f05c); undefined until they arrive. */
export function useUnreadByKind(): UnreadByKind | undefined {
  const { data } = useQuery({ queryKey: INBOX_UNREAD_QUERY_KEY, queryFn: fetchUnreadByKind, staleTime: Infinity })
  return data
}

export function useInbox(kind: ProviderKind): InboxQuery {
  const { data, dataUpdatedAt, error, errorUpdatedAt, refetch } = useQuery({ queryKey: inboxKey(kind), queryFn: () => fetchInbox(kind), staleTime: Infinity })
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
export function useConversationList(kind: ProviderKind, filter: InboxFilter, now: Date): ConversationListQuery {
  const query = useInfiniteQuery({
    queryKey: conversationsKey(kind, filter),
    queryFn: ({ pageParam }) => fetchConversations(filter, pageParam, kind),
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
  const loaded = (data?.pages.flatMap((page) => page.items) ?? []).filter(
    (item) => item.kind === kind && !seen.has(item.id) && seen.add(item.id),
  )
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

// Every counts of a frame moves with the row; the frame of the other kind keeps its own numbers but both of `unreadByKind`.
function moveCounts(queryClient: QueryClient, before: ConversationItem, after: ConversationItem) {
  for (const kind of ['EMAIL', 'CHAT'] as const) {
    queryClient.setQueryData<InboxData>(inboxKey(kind), (inbox) => {
      if (!inbox) {
        return inbox
      }
      const moved = countsAfter(inbox.counts, before, after)
      return { ...inbox, counts: kind === after.kind ? moved : { ...inbox.counts, unreadByKind: moved.unreadByKind } }
    })
  }
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
    void navigate({ pathname: SCREENS[item.kind].path, search: backSearch })
  }
  return { markUnread: () => change({ read: false }), toggleArchive: () => change({ archived: !item.archived }) }
}

/**
 * Sends a message. It shows at once at the end of the conversation as "Đang gửi", becomes the stored message when the
 * server answers (and the row's preview), or is marked "Không gửi được" when sending fails.
 */
// What a reply on its way needs: a resend carries the ID of the first try; `attempt` tells this try from a later one. It is
// a text, or a sticker of the library (zalo-send-images), which the server turns into a picture.
type Try =
  | { kind: 'TEXT'; text: string; clientMessageId: string }
  | { kind: 'STICKER'; stickerId: string; clientMessageId: string }
type Outgoing = Try & { attempt: number }

/** The text the server stores a sticker with; shown while the sticker has no picture to show. */
const STICKER_TEXT = '[Sticker]'

/** Stickers of every conversation go through one queue (D-355): the limit of sino-zalo is per account. */
const STICKER_SCOPE = 'stickers'

const storedId = (error: unknown) => (error instanceof ApiError && typeof error.extra.messageId === 'string' ? error.extra.messageId : null)

/**
 * Sends replies (F10, D-131, D-134). Each message gets a `clientMessageId`; it waits in the outbox of this browser as
 * "Đang gửi". Whatever the answer, the list of the server is read again, and once it has the message the outbox lets
 * go of it. A refused send stays with "Gửi lại" (same ID) and "Bỏ"; one whose fate is unknown says so, and when the
 * answer never came (the network) it may be sent again safely; "not allowed" reads the conversation again so its
 * notice shows. Offline, TanStack Query holds the send until the network is back.
 */
export function useSendMessage(conversationId: string, afterDiscard?: () => void) {
  const queryClient = useQueryClient()
  const editOutbox = (change: (mails: Mail[]) => Mail[]) => queryClient.setQueryData<Mail[]>(outboxKey(conversationId), (mails = []) => change(mails))
  const editMail = (clientMessageId: string, change: (mail: Mail) => Mail) =>
    editOutbox((mails) => mails.map((mail) => (mail.clientMessageId === clientMessageId ? change(mail) : mail)))
  // The latest try of each message: an older try that ends late must not let go of a newer one.
  const attempts = useRef(new Map<string, number>())

  // What happens before, after and instead of the answer is the same for a text and for a sticker; they differ in the request.
  const callbacks = {
    onMutate: (outgoing: Outgoing) => {
      const { clientMessageId } = outgoing
      const pending: Mail = {
        id: `local-${clientMessageId}`,
        kind: 'MESSAGE',
        direction: 'OUT',
        sender: 'Bạn',
        to: null,
        at: new Date().toISOString(),
        text: outgoing.kind === 'STICKER' ? STICKER_TEXT : outgoing.text,
        attachments: [],
        status: 'SENDING',
        linked: [],
        clientMessageId,
        ...(outgoing.kind === 'STICKER' ? { libraryStickerId: outgoing.stickerId } : {}),
        local: true,
      }
      editOutbox((mails) =>
        mails.some((mail) => mail.clientMessageId === clientMessageId)
          ? mails.map((mail) => (mail.clientMessageId === clientMessageId ? { ...mail, status: 'SENDING' } : mail))
          : [...mails, pending],
      )
    },
    onSuccess: (sent: Mail, { clientMessageId }: Outgoing) => {
      editMail(clientMessageId, () => ({ ...sent, clientMessageId }))
      updateItem(queryClient, conversationId, (item) => ({
        ...item,
        snippet: sent.kind === 'MESSAGE' ? sent.text : item.snippet,
        snippetFrom: item.memberCount ? 'Bạn' : null,
        lastMessageAt: sent.at,
      }))
    },
    onError: (error: unknown, { clientMessageId }: Outgoing) => {
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
    onSettled: async (_sent: Mail | undefined, _error: unknown, { clientMessageId, attempt }: Outgoing) => {
      await queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) })
      const pages = queryClient.getQueryData<MessagePages>(messagesKey(conversationId))
      const stored = pages?.pages.some((page) => page.items.some((message) => message.kind === 'MESSAGE' && message.clientMessageId === clientMessageId))
      if (stored && attempts.current.get(clientMessageId) === attempt) {
        editOutbox((mails) => mails.filter((mail) => mail.clientMessageId !== clientMessageId))
      }
    },
  }
  const request = (outgoing: Outgoing) =>
    outgoing.kind === 'STICKER' ? sendSticker(conversationId, outgoing.stickerId, outgoing.clientMessageId) : sendMessage(conversationId, outgoing.text, outgoing.clientMessageId)
  const texts = useMutation({ ...callbacks, mutationFn: request })
  // One at a time, in the order they were clicked, and a little over a second apart (D-355, stickerQueue). Each shows at
  // once (`onMutate` does not wait for its turn), and one that is refused does not hold back the next.
  const stickers = useMutation({
    ...callbacks,
    scope: { id: STICKER_SCOPE },
    mutationFn: async (outgoing: Outgoing) => {
      await stickerTurns.wait()
      return request(outgoing)
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
    onSuccess: () => {
      // The opening mail of a new conversation was its only mail: the conversation is gone too (f10-new-mail, D-195).
      if (afterDiscard) {
        refreshInbox(queryClient)
        afterDiscard()
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) }),
  })
  const sendTry = (next: Try) => {
    const attempt = (attempts.current.get(next.clientMessageId) ?? 0) + 1
    attempts.current.set(next.clientMessageId, attempt)
    const outgoing: Outgoing = { ...next, attempt }
    if (outgoing.kind === 'STICKER') {
      stickers.mutate(outgoing)
    } else {
      texts.mutate(outgoing)
    }
  }

  return {
    send: (text: string) => sendTry({ kind: 'TEXT', text, clientMessageId: crypto.randomUUID() }),
    /** Sends a sticker of the user's library as a picture (zalo-send-images); it shows at once and goes in its turn. */
    sendSticker: (stickerId: string) => sendTry({ kind: 'STICKER', stickerId, clientMessageId: crypto.randomUUID() }),
    resend: (mail: Mail) => {
      if (mail.clientMessageId) {
        sendTry(
          mail.libraryStickerId
            ? { kind: 'STICKER', stickerId: mail.libraryStickerId, clientMessageId: mail.clientMessageId }
            : { kind: 'TEXT', text: mail.text, clientMessageId: mail.clientMessageId },
        )
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

/** The fields of the form of a new mail a refusal can point at. */
export type NewMailField = 'from' | 'to' | 'subject' | 'text'

/** What the form of a new mail shows about its send (f10-new-mail, D-194). */
export interface NewMailSend {
  send: (draft: NewMailDraft) => void
  /** The same mail under the same `clientMessageId`: safe whatever became of the try before (D-131). */
  retry: () => void
  pending: boolean
  /** Offline: the send waits for the network. */
  paused: boolean
  /** The mail may have gone: it is locked, and only "Gửi lại" (same ID) or "Bỏ" are offered. */
  locked: string | null
  /** A refusal the user can act on; the mail stays editable. */
  notice: string | null
  fieldErrors: Partial<Record<NewMailField, string>>
}

const NO_OUTCOME = { locked: null, notice: null, fieldErrors: {} } satisfies Pick<NewMailSend, 'locked' | 'notice' | 'fieldErrors'>

/**
 * Sends a new mail (f10-new-mail, D-194). Each mail gets a `clientMessageId`. The server makes the conversation before
 * it calls Gmail (D-192), so whenever it answers with that conversation (sent, refused, unknown) the form gives way to
 * it, without asking to drop the mail. No answer at all locks the mail: it may have gone, and only the same ID again is
 * safe. A refusal that names a field, the account, or a backend without the request leaves the mail editable.
 */
export function useCreateConversation(backSearch: string): NewMailSend {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const tried = useRef<{ draft: NewMailDraft; clientMessageId: string } | null>(null)
  const [outcome, setOutcome] = useState<Pick<NewMailSend, 'locked' | 'notice' | 'fieldErrors'>>(NO_OUTCOME)
  const open = (conversationId: string) => {
    refreshInbox(queryClient)
    navigate({ pathname: `/inbox/${conversationId}`, search: backSearch }, { replace: true, state: LEAVE_FREELY })
  }

  const mutation = useMutation({
    mutationFn: ({ draft, clientMessageId }: { draft: NewMailDraft; clientMessageId: string }) => createConversation(draft, clientMessageId),
    onMutate: ({ draft }) => {
      rememberSender(draft.accountId)
      setOutcome(NO_OUTCOME)
    },
    onSuccess: ({ item }) => open(item.id),
    onError: (error) => {
      const problem = error instanceof ApiError ? error : null
      const conversationId = typeof problem?.extra.conversationId === 'string' ? problem.extra.conversationId : null
      if (conversationId) {
        // Refused or unknown (502, 504, 409 SEND_OUTCOME_UNKNOWN): the conversation shows the mail with its state (F10).
        open(conversationId)
      } else if (problem?.code === 'VALIDATION_FAILED') {
        setOutcome({ ...NO_OUTCOME, fieldErrors: fieldErrorsOf(problem.errors.map((entry) => entry.field)) })
      } else if (problem?.code === 'SEND_NOT_ALLOWED' || problem?.code === 'ACCOUNT_NOT_FOUND') {
        void queryClient.invalidateQueries({ queryKey: FRAMES_KEY })
        setOutcome({ ...NO_OUTCOME, fieldErrors: { from: 'Tài khoản này không gửi được thư nữa' } })
      } else if (problem?.status === 404 || problem?.status === 405) {
        setOutcome({ ...NO_OUTCOME, notice: 'Sino chưa gửi được thư mới. Bạn gửi trong Gmail.' })
      } else if (problem?.code === 'SEND_IN_PROGRESS') {
        setOutcome({ ...NO_OUTCOME, locked: 'Lần gửi trước vẫn đang chạy. Chờ ít giây rồi gửi lại.' })
      } else {
        // No answer, or one that does not say what became of the mail.
        const lost = problem === null || problem.code === NETWORK_ERROR
        setOutcome({ ...NO_OUTCOME, locked: `${lost ? 'Mất kết nối khi gửi.' : 'Không rõ thư đã gửi chưa.'} Gửi lại không làm thư bị gửi hai lần.` })
      }
    },
  })

  return {
    send: (draft) => {
      tried.current = { draft, clientMessageId: crypto.randomUUID() }
      mutation.mutate(tried.current)
    },
    retry: () => {
      if (tried.current) {
        mutation.mutate(tried.current)
      }
    },
    pending: mutation.isPending,
    paused: mutation.isPaused,
    ...outcome,
  }
}

// The server names fields as its request has them ("to", "to[0]", "accountId"); the form names its own.
function fieldErrorsOf(fields: string[]): NewMailSend['fieldErrors'] {
  const errors: NewMailSend['fieldErrors'] = {}
  for (const field of fields) {
    if (field.startsWith('to')) {
      errors.to = 'Người nhận không hợp lệ'
    } else if (field === 'subject') {
      errors.subject = 'Tiêu đề quá dài'
    } else if (field === 'text') {
      errors.text = 'Nội dung không hợp lệ'
    } else if (field === 'accountId') {
      errors.from = 'Tài khoản không hợp lệ'
    }
  }
  return errors
}

/** The frame, the lists and the count of the navigation: after a conversation came or went. */
function refreshInbox(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: FRAMES_KEY })
  void queryClient.invalidateQueries({ queryKey: LISTS_KEY })
  void queryClient.invalidateQueries({ queryKey: INBOX_UNREAD_QUERY_KEY })
}
