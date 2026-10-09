import { type QueryKey, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ACCOUNTS_QUERY_KEY } from '@/features/accounts/useAccounts'
import { INBOX_QUERY_KEY } from '@/features/inbox/useInbox'
import { setStreamState } from '@/shared/realtime/streamState'

/**
 * The one event stream of the signed-in app (F08, D-90). An event carries no content: it only says what to read again
 * from the API, so every permission check stays in the API. The browser reconnects by itself (`retry` of the server).
 */
export function useEventStream() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const source = new EventSource('/api/events/stream')
    const readAgain = (...keys: QueryKey[]) => keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }))
    let opened = false

    source.addEventListener('open', () => {
      // The stream has no event ids, so what was sent while it was down is lost: read again what it could have changed.
      if (opened) {
        readAgain(INBOX_QUERY_KEY, ACCOUNTS_QUERY_KEY)
      }
      opened = true
      setStreamState('open')
    })
    source.addEventListener('error', () => setStreamState(source.readyState === EventSource.CLOSED ? 'closed' : 'connecting'))
    source.addEventListener('conversations.changed', () => readAgain(INBOX_QUERY_KEY))
    source.addEventListener('account.changed', () => readAgain(ACCOUNTS_QUERY_KEY, INBOX_QUERY_KEY))

    return () => {
      source.close()
      setStreamState('connecting')
    }
  }, [queryClient])
}
