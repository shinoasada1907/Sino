import { vi } from 'vitest'
import { applyChange, type ConversationChange } from '@/features/inbox/conversationChange'
import { filterConversations, type InboxFilter } from '@/features/inbox/format'
import type * as InboxApi from '@/features/inbox/inbox.api'
import { createConversationSample, createInboxSample, frameOf, type InboxSample } from '@/features/inbox/inbox.sample'
import { ApiError } from '@/shared/api/problem'
import type { ProviderKind } from '@/shared/domain'

// Kept apart from renderApp: the mock of inbox.api imports this file, so nothing here may import inbox.api itself.
let current: InboxSample | null = null

/** The sample the mocked requests answer from (`renderApp` serves its `inbox` option, or a fresh sample). */
export function serveInboxSample(sample: InboxSample) {
  current = structuredClone(sample)
}

const served = () => (current ??= createInboxSample(new Date()))

const notFound = () => new ApiError(404, 'CONVERSATION_NOT_FOUND', null)

/**
 * For `vi.mock('./inbox.api', …)` in the tests of the full contract (messages and sending, which the API does not have
 * yet): every request answered from the served sample, one page per list, each a `vi.fn` a test can override.
 */
export function sampleInboxApi(api: typeof InboxApi): typeof InboxApi {
  return {
    ...api,
    fetchUnreadByKind: vi.fn(async () => api.unreadByKindOf(served().counts)),
    fetchInbox: vi.fn(async (kind?: ProviderKind) => frameOf(served(), kind)),
    fetchConversations: vi.fn(async (filter: InboxFilter, _cursor: string | null, kind?: ProviderKind) => ({
      items: filterConversations(served().conversations, filter, new Date()).filter((item) => !kind || item.kind === kind),
      nextCursor: null,
    })),
    fetchConversation: vi.fn(async (conversationId: string) => {
      const item = served().conversations.find((conversation) => conversation.id === conversationId)
      if (!item) {
        throw notFound()
      }
      return { item, detail: createConversationSample(conversationId, new Date()) }
    }),
    // The messages of the sample conversation, newest first, on one page.
    fetchMessages: vi.fn(async (conversationId: string, _cursor: string | null) => {
      if (!served().conversations.some((conversation) => conversation.id === conversationId)) {
        throw notFound()
      }
      return { items: [...(createConversationSample(conversationId, new Date()).messages ?? [])].reverse(), nextCursor: null }
    }),
    updateConversation: vi.fn(async (conversationId: string, change: ConversationChange) => {
      const sample = served()
      const item = sample.conversations.find((conversation) => conversation.id === conversationId)
      if (!item) {
        throw notFound()
      }
      const stored = applyChange(item, change)
      sample.conversations = sample.conversations.map((conversation) => (conversation.id === conversationId ? stored : conversation))
      return stored
    }),
    // The same for a sticker of the library (zalo-send-images), and a discard has nothing to do.
    sendSticker: vi.fn(async (_conversationId: string, stickerId: string, clientMessageId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      return {
        id: crypto.randomUUID(),
        kind: 'MESSAGE' as const,
        direction: 'OUT' as const,
        sender: 'Bạn',
        to: null,
        at: new Date().toISOString(),
        text: '[Sticker]',
        attachments: [],
        status: 'SENT' as const,
        linked: [],
        clientMessageId,
        libraryStickerId: stickerId,
      }
    }),
    discardMessage: vi.fn(async () => {}),
    // Long enough to see "Đang gửi"; the sample has no server to keep it.
    sendMessage: vi.fn(async (_conversationId: string, text: string, clientMessageId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      return {
        id: crypto.randomUUID(),
        kind: 'MESSAGE' as const,
        direction: 'OUT' as const,
        sender: 'Bạn',
        to: null,
        at: new Date().toISOString(),
        text,
        attachments: [],
        status: 'SENT' as const,
        linked: [],
        clientMessageId,
      }
    }),
  }
}
