import { api } from '@/shared/api/client'
import type { AccountStatus, Instant, ProviderInfo } from '@/shared/domain'
import type { InboxFilter } from './format'
import type { ConversationItem, ConversationKind, ConversationPage, InboxAccount, InboxData, Member, Message, OpenConversation } from './inbox.types'

/*
 * The requests of the Hộp thư screens, on the F05 API (D-56): what the API does not give yet is null. Messages come with
 * F06 (D-71) and sending with F10 (D-72); `sendMessage` still answers with sample data.
 */

/** The fields of `GET /api/accounts` the inbox uses (F02). */
interface AccountResponse {
  id: string
  provider: string
  externalAccountId: string
  displayName: string
  address: string | null
  status: AccountStatus
}

/** One provider of `GET /api/providers` (F03). */
interface ProviderResponse {
  type: string
  displayName: string
}

/** `GET /api/conversations/counts`: conversations that are not archived; `byProvider` counts the unread ones. */
interface CountsResponse {
  unread: number
  byProvider: Record<string, number>
  needsReply: number
  withAttachments: number
  scheduled: number
  snoozed: number
}

/** One item of `GET /api/conversations`; snooze, scheduled sending and linked items are empty until those features. */
interface ConversationResponse {
  id: string
  accountId: string
  provider: string
  kind: ConversationKind
  title: string
  subject: string | null
  memberCount: number | null
  snippetFrom: string | null
  /** Null when the newest message has no text. */
  snippet: string | null
  lastMessageAt: Instant
  unreadCount: number
  needsReply: boolean
  hasAttachments: boolean
  archived: boolean
  snooze: ConversationItem['snooze']
  scheduledSend: ConversationItem['scheduledSend']
  linked: ConversationItem['linked'] | null
}

/** A person of `GET /api/conversations/{id}`; `self` is the connected account. */
interface ParticipantResponse {
  externalId: string
  name: string | null
  avatarUrl: string | null
  self: boolean
}

function toItem({ snippet, linked, ...rest }: ConversationResponse): ConversationItem {
  return { ...rest, snippet: snippet ?? '', linked: linked ?? [] }
}

function toAccount({ id, provider, externalAccountId, displayName, address, status }: AccountResponse): InboxAccount {
  return { id, provider, externalAccountId, address: address ?? displayName, status, syncProgress: null, statusChangedAt: null }
}

// The API does not say who runs a group or who joined lately.
function toMember({ externalId, name, self }: ParticipantResponse): Member {
  return { name: self ? 'Bạn' : (name ?? externalId), owner: false, joinedRecently: false }
}

/** `GET /api/conversations/counts`, the unread conversations only: the count of the navigation (D-93). */
export async function fetchUnreadCount(): Promise<number> {
  return (await api.get<CountsResponse>('/api/conversations/counts')).unread
}

/** `GET /api/accounts`, `GET /api/providers` and `GET /api/conversations/counts`. */
export async function fetchInbox(): Promise<InboxData> {
  const [accounts, providers, counts] = await Promise.all([
    api.get<AccountResponse[]>('/api/accounts'),
    api.get<ProviderResponse[]>('/api/providers'),
    api.get<CountsResponse>('/api/conversations/counts'),
  ])
  return {
    generatedAt: new Date().toISOString(),
    providers: providers.map(({ type, displayName }): ProviderInfo => ({ type, displayName })),
    accounts: accounts.map(toAccount),
    counts: { ...counts, byProvider: Object.entries(counts.byProvider).map(([provider, unread]) => ({ provider, unread })) },
  }
}

/** `GET /api/conversations`: one page of a view and a source; `cursor` is the `nextCursor` of the page before. */
export async function fetchConversations({ view, source }: InboxFilter, cursor: string | null): Promise<ConversationPage> {
  const params = new URLSearchParams({ view })
  if (source) {
    params.set('provider', source)
  }
  if (cursor) {
    params.set('cursor', cursor)
  }
  const page = await api.get<{ items: ConversationResponse[]; nextCursor: string | null }>(`/api/conversations?${params}`)
  return { items: page.items.map(toItem), nextCursor: page.nextCursor }
}

/** `GET /api/conversations/{id}`: the row and the people; no messages before F06, no sending before F10. */
export async function fetchConversation(conversationId: string): Promise<OpenConversation> {
  const { participants, ...item } = await api.get<ConversationResponse & { participants: ParticipantResponse[] }>(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
  )
  return {
    item: toItem(item),
    detail: {
      id: item.id,
      messages: null,
      firstUnreadId: null,
      linked: null,
      members: participants.map(toMember),
      files: null,
      canSend: null,
      previousCursor: null,
    },
  }
}

/** `PATCH /api/conversations/{id}`: read or archived, in Sino only (D-67); returns the row as the server stored it. */
export async function updateConversation(conversationId: string, change: { read?: boolean; archived?: boolean }): Promise<ConversationItem> {
  return toItem(await api.patch<ConversationResponse>(`/api/conversations/${encodeURIComponent(conversationId)}`, change))
}

// Long enough to see "Đang gửi" with sample data.
const SAMPLE_SEND_DELAY_MS = 800

/** Later `POST /api/conversations/{id}/messages` (F10); returns the message as the server stored it. */
export async function sendMessage(_conversationId: string, text: string): Promise<Message> {
  await new Promise((resolve) => setTimeout(resolve, SAMPLE_SEND_DELAY_MS))
  return {
    id: crypto.randomUUID(),
    kind: 'MESSAGE',
    direction: 'OUT',
    sender: 'Bạn',
    to: null,
    at: new Date().toISOString(),
    text,
    attachments: [],
    status: 'SENT',
    linked: [],
  }
}
