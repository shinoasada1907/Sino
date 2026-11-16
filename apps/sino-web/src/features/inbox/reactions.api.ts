import { api } from '@/shared/api/client'
import type { Reaction } from './reactions'

const path = (conversationId: string, messageId: string) =>
  `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reaction`

/** `PUT …/messages/{messageId}/reaction` (zalo-reactions, D-386): drops or changes the user's emoji; the message's reactions after it. */
export async function putReaction(conversationId: string, messageId: string, code: string): Promise<Reaction[]> {
  return (await api.put<{ reactions: Reaction[] }>(path(conversationId, messageId), { code })).reactions
}

/** `DELETE …/messages/{messageId}/reaction`: takes the user's emoji off; the message's reactions after it. */
export async function deleteReaction(conversationId: string, messageId: string): Promise<Reaction[]> {
  return (await api.delete<{ reactions: Reaction[] }>(path(conversationId, messageId))).reactions
}
