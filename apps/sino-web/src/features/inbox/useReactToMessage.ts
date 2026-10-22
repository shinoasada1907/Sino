import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ApiError } from '@/shared/api/problem'
import type { MessagePage } from './inbox.types'
import { afterPick, type Reaction, type ReactionKind } from './reactions'
import { deleteReaction, putReaction } from './reactions.api'
import { messagesKey } from './useInbox'

type Pages = InfiniteData<MessagePage, string | null>

interface Pick {
  messageId: string
  /** The emoji to drop, or null to take the user's off. */
  code: string | null
  /** The chip before this pick, put back if it is refused. */
  before: Reaction[]
  next: Reaction[]
  /** Which pick of this message it is; only the last one's answer is kept. */
  ticket: number
}

/** Why a pick did not go, by message; shown under that message until the next pick. */
export interface ReactionFailure {
  messageId: string
  text: string
}

/**
 * Drops, changes or takes off the user's emoji on a message (zalo-reactions, D-391). The chip changes at once; the picks
 * go one after another (the server sets the whole state each time, so a pick overtaken before it left is not sent), and
 * only the answer to the last pick of a message is kept. A refused pick puts the chip back and reads the messages again.
 */
export function useReactToMessage(conversationId: string, previewOnly = false) {
  const queryClient = useQueryClient()
  const tickets = useRef(new Map<string, number>())
  const [failure, setFailure] = useState<ReactionFailure | null>(null)
  const isLast = ({ messageId, ticket }: Pick) => tickets.current.get(messageId) === ticket

  const write = (messageId: string, reactions: Reaction[]) =>
    queryClient.setQueryData<Pages>(
      messagesKey(conversationId),
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((message) => (message.id === messageId && message.kind === 'MESSAGE' ? { ...message, reactions } : message)),
          })),
        },
    )

  const picking = useMutation({
    scope: { id: `reactions-${conversationId}` },
    mutationFn: async (pick: Pick): Promise<Reaction[] | null> => {
      if (!isLast(pick)) {
        return null
      }
      // The dev preview (reactionsPreview.ts) keeps the pick in this browser: there is no backend for it yet.
      if (previewOnly) {
        return pick.next
      }
      return pick.code ? putReaction(conversationId, pick.messageId, pick.code) : deleteReaction(conversationId, pick.messageId)
    },
    onMutate: async (pick: Pick) => {
      // A reading in flight would put the old chip back.
      await queryClient.cancelQueries({ queryKey: messagesKey(conversationId) })
      write(pick.messageId, pick.next)
    },
    onSuccess: (reactions, pick) => {
      if (reactions && isLast(pick)) {
        write(pick.messageId, reactions)
      }
    },
    onError: (error, pick) => {
      if (!isLast(pick)) {
        return
      }
      write(pick.messageId, pick.before)
      setFailure({
        messageId: pick.messageId,
        text: error instanceof ApiError && error.status === 429 ? 'Chậm lại một chút.' : 'Không thả được biểu cảm. Hãy thử lại.',
      })
      void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) })
    },
  })

  return {
    /** Picks `kind` on a message whose reactions are `current`: drops it, or takes it off when it already is the user's. */
    react(messageId: string, current: Reaction[], kind: ReactionKind) {
      const next = afterPick(current, kind)
      const ticket = (tickets.current.get(messageId) ?? 0) + 1
      tickets.current.set(messageId, ticket)
      setFailure(null)
      picking.mutate({ messageId, code: next.some((reaction) => reaction.mine) ? kind.code : null, before: current, next, ticket })
    },
    failure,
  }
}
