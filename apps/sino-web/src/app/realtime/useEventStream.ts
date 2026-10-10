import { type QueryKey, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ACCOUNTS_QUERY_KEY } from '@/features/accounts/useAccounts'
import { INBOX_QUERY_KEY, INBOX_UNREAD_QUERY_KEY } from '@/features/inbox/useInbox'
import { type ConversationsChanged, publishConversationsChanged, setStreamState, useStreamState } from '@/shared/realtime/streamState'

// Without the stream the backend still stores new mail about every minute (BE-49): read the inbox along with it (D-96).
const FALLBACK_MS = 60_000

/**
 * The one event stream of the signed-in app (F08, D-90). An event carries no content: it only says what to read again
 * from the API, so every permission check stays in the API. The browser reconnects by itself (`retry` of the server);
 * while the stream is not open, the inbox is read again every minute instead.
 */
export function useEventStream() {
  const queryClient = useQueryClient()
  const state = useStreamState()

  useEffect(() => {
    if (state === 'open') {
      return
    }
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: INBOX_UNREAD_QUERY_KEY })
    }, FALLBACK_MS)
    return () => clearInterval(timer)
  }, [state, queryClient])

  useEffect(() => {
    const source = new EventSource('/api/events/stream')
    const readAgain = (...keys: QueryKey[]) => keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }))
    let opened = false

    source.addEventListener('open', () => {
      // The stream has no event ids, so what was sent while it was down is lost: read again what it could have changed.
      if (opened) {
        readAgain(INBOX_QUERY_KEY, INBOX_UNREAD_QUERY_KEY, ACCOUNTS_QUERY_KEY)
      }
      opened = true
      setStreamState('open')
    })
    source.addEventListener('error', () => setStreamState(source.readyState === EventSource.CLOSED ? 'closed' : 'connecting'))
    source.addEventListener('conversations.changed', (event) => {
      readAgain(INBOX_QUERY_KEY, INBOX_UNREAD_QUERY_KEY)
      try {
        publishConversationsChanged(JSON.parse((event as MessageEvent<string>).data) as ConversationsChanged)
      } catch {
        // A malformed event still reads the inbox again; only the notice is left out.
      }
    })
    source.addEventListener('account.changed', () => readAgain(ACCOUNTS_QUERY_KEY, INBOX_QUERY_KEY, INBOX_UNREAD_QUERY_KEY))

    return () => {
      source.close()
      setStreamState('connecting')
    }
  }, [queryClient])
}
