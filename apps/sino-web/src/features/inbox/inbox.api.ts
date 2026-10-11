import { api } from '@/shared/api/client'
import type { AccountStatus, Instant, ProviderInfo } from '@/shared/domain'
import type { InboxFilter } from './format'
import type {
  Attachment,
  ConversationItem,
  ConversationKind,
  ConversationPage,
  InboxAccount,
  InboxData,
  Member,
  Message,
  MessageBody,
  MessagePage,
  OpenConversation,
} from './inbox.types'

/*
 * The requests of the Hộp thư screens, on the F05 and F06 APIs (D-56): what the API does not give yet is null. Sending
 * comes with F10 (D-72); `sendMessage` still answers with sample data.
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

/** Whether Sino can reply in a conversation, and to whom (F10, D-133). */
interface ReplyResponse {
  state: 'READY' | 'NEEDS_PERMISSION' | 'ACCOUNT_UNAVAILABLE' | 'NOT_SUPPORTED'
  to: PersonResponse[]
}

const CAN_SEND: Record<ReplyResponse['state'], boolean | null> = { READY: true, NEEDS_PERMISSION: false, ACCOUNT_UNAVAILABLE: false, NOT_SUPPORTED: null }

/** A person of `GET /api/conversations/{id}`; `self` is the connected account. */
interface ParticipantResponse {
  externalId: string
  name: string | null
  avatarUrl: string | null
  self: boolean
}

/** Someone a message is from or to (F06): the address is the email for Gmail, the provider's ID otherwise. */
interface PersonResponse {
  name: string | null
  address: string
}

/** A file of a message; the provider may not give its name, type or size. */
interface AttachmentResponse {
  id: string
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
}

/** One message of `GET /api/conversations/{id}/messages` (F06, D-123). */
interface MessageResponse {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'UNKNOWN'
  sentAt: Instant
  /** Null when the provider does not say who sent it (a system notice); Gmail always does. */
  sender: (PersonResponse & { self: boolean }) | null
  /** Null when Sino does not know, for mail imported before F06. */
  to: PersonResponse[] | null
  cc: PersonResponse[] | null
  subject: string | null
  text: string | null
  bodyFormat: 'TEXT' | 'HTML' | 'UNCHECKED'
  read: boolean
  attachments: AttachmentResponse[]
  /** For a message sent from Sino (F10); absent on a backend before F10. */
  clientMessageId?: string | null
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

// "PDF" from "hop-dong.pdf", otherwise from the type ("image/png" gives "PNG"), otherwise "TỆP".
function fileType(fileName: string | null, mimeType: string | null): string {
  const extension = fileName?.match(/\.([a-z0-9]{1,5})$/i)?.[1]
  if (extension) {
    return extension.toUpperCase()
  }
  const subtype = mimeType?.split('/')[1]?.split(/[;+.-]/)[0]
  return subtype && subtype.length <= 5 ? subtype.toUpperCase() : 'TỆP'
}

/** `GET /api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}` (F06): always a download (D-125). */
export function attachmentUrl(conversationId: string, messageId: string, attachmentId: string): string {
  return `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
}

function toAttachment({ fileName, mimeType, sizeBytes }: AttachmentResponse, url: string): Attachment {
  return { name: fileName ?? 'Tệp không tên', type: fileType(fileName, mimeType), sizeBytes, image: mimeType?.startsWith('image/') ?? false, caption: null, url }
}

type Mail = Extract<Message, { kind: 'MESSAGE' }>

function ownStatus(status: MessageResponse['status']): Mail['status'] {
  switch (status) {
    case 'PENDING':
      return 'SENDING'
    case 'FAILED':
    case 'UNKNOWN':
      return status
    default:
      return 'SENT'
  }
}

// The reader is "Bạn"; a message without a known sender is named so, or is the reader's own when it went out.
function senderName(sender: MessageResponse['sender'], outbound: boolean): string {
  if (!sender) {
    return outbound ? 'Bạn' : 'Không rõ người gửi'
  }
  return sender.self ? 'Bạn' : (sender.name ?? sender.address)
}

function toMessage(conversationId: string, { id, direction, status, sentAt, sender, to, text, bodyFormat, attachments, clientMessageId }: MessageResponse): Mail {
  const outbound = direction === 'OUTBOUND'
  const recipients = to?.map((person) => person.name ?? person.address).join(', ')
  return {
    id,
    kind: 'MESSAGE',
    direction: outbound ? 'OUT' : 'IN',
    sender: senderName(sender, outbound),
    to: recipients || null,
    at: sentAt,
    text: text ?? '',
    bodyFormat,
    attachments: attachments.map((file) => toAttachment(file, attachmentUrl(conversationId, id, file.id))),
    status: outbound ? ownStatus(status) : null,
    linked: [],
    ...(clientMessageId ? { clientMessageId } : {}),
  }
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

/** `GET /api/conversations/{id}`: the row, the people, and whether Sino can reply (F10); the messages come from `fetchMessages`. */
export async function fetchConversation(conversationId: string): Promise<OpenConversation> {
  // `reply` is absent on a backend before F10.
  const { participants, reply, ...item } = await api.get<ConversationResponse & { participants: ParticipantResponse[]; reply?: ReplyResponse }>(
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
      // A state this web does not know yet does not open the reply box.
      canSend: reply ? (CAN_SEND[reply.state] ?? null) : null,
      replyTo: reply ? reply.to.map(({ name, address }) => ({ name, address })) : null,
      previousCursor: null,
    },
  }
}

/** `GET /api/conversations/{id}/messages` (F06): one page, newest first; `cursor` is the `nextCursor` of the page before. */
export async function fetchMessages(conversationId: string, cursor: string | null): Promise<MessagePage> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : ''
  const page = await api.get<{ items: MessageResponse[]; nextCursor: string | null }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
  )
  return { items: page.items.map((message) => toMessage(conversationId, message)), nextCursor: page.nextCursor }
}

/** `GET /api/conversations/{id}/messages/{messageId}/body` (F06): the cleaned HTML of one email (D-120, D-122). */
export async function fetchMessageBody(conversationId: string, messageId: string): Promise<MessageBody> {
  return api.get<MessageBody>(`/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/body`)
}

/** `PATCH /api/conversations/{id}`: read or archived, in Sino only (D-67); returns the row as the server stored it. */
export async function updateConversation(conversationId: string, change: { read?: boolean; archived?: boolean }): Promise<ConversationItem> {
  return toItem(await api.patch<ConversationResponse>(`/api/conversations/${encodeURIComponent(conversationId)}`, change))
}

/**
 * `POST /api/conversations/{id}/messages` (F10, D-131): sends a reply and returns it as the server stored it. Sending
 * again with the same `clientMessageId` never sends twice.
 */
export async function sendMessage(conversationId: string, text: string, clientMessageId: string): Promise<Mail> {
  const sent = await api.post<MessageResponse>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, { text, clientMessageId })
  return toMessage(conversationId, sent)
}

/** `DELETE /api/conversations/{id}/messages/{messageId}` (F10): throws away a reply the provider refused. */
export async function discardMessage(conversationId: string, messageId: string): Promise<void> {
  await api.delete<void>(`/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`)
}
