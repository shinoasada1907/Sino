import { createConversationSample, createInboxSample } from './inbox.sample'
import type { ConversationDetail, InboxData, Message } from './inbox.types'

/*
 * The requests of the Hộp thư screens. They return sample data until the backend has F05, F06 and F10 (D-42);
 * connecting the API means changing only the bodies below.
 */

/** Later `GET /api/conversations`. */
export async function fetchInbox(): Promise<InboxData> {
  return createInboxSample(new Date())
}

/** Later `GET /api/conversations/{id}` and its messages. */
export async function fetchConversation(conversationId: string): Promise<ConversationDetail> {
  return createConversationSample(conversationId, new Date())
}

/** Later `PATCH /api/conversations/{id}` with `{ read: true }`. */
export async function markRead(_conversationId: string): Promise<void> {}

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
