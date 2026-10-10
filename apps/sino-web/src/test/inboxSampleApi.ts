import { vi } from 'vitest'
import { applyChange, type ConversationChange } from '@/features/inbox/conversationChange'
import { filterConversations, type InboxFilter } from '@/features/inbox/format'
import type * as InboxApi from '@/features/inbox/inbox.api'
import { createConversationSample, createInboxSample, type InboxSample } from '@/features/inbox/inbox.sample'
import { ApiError } from '@/shared/api/problem'

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
    fetchUnreadCount: vi.fn(async () => served().counts.unread),
    fetchInbox: vi.fn(async () => {
      const { generatedAt, providers, accounts, counts } = served()
      return { generatedAt, providers, accounts, counts }
    }),
    fetchConversations: vi.fn(async (filter: InboxFilter, _cursor: string | null) => ({
      items: filterConversations(served().conversations, filter, new Date()),
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
    sendMessage: vi.fn(api.sendMessage),
  }
}
