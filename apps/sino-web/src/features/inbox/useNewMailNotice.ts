import { useEffect, useRef, useState } from 'react'
import { onConversationsChanged } from '@/shared/realtime/streamState'

// How long "N thư mới" stays after the last new mail; the bar of the shell (NF-02) waits as long once the tab shows again.
export const NOTICE_MS = 6000

/**
 * "N thư mới" / "N tin mới" (D-92): the new conversations brought by background sync since the notice last showed;
 * imports and the user's own changes do not count, nor do accounts of the other screen (f05c). It hides 6 s after the
 * last one, or when dismissed.
 */
export function useNewMailNotice(accountIds: string[]): { count: number; dismiss: () => void } {
  const [count, setCount] = useState(0)
  // Read when an event comes, so a new list of accounts does not listen anew.
  const mine = useRef(new Set(accountIds))
  useEffect(() => {
    mine.current = new Set(accountIds)
  })

  useEffect(
    () =>
      onConversationsChanged((event) => {
        if (event.source === 'sync' && event.newInbound > 0 && mine.current.has(event.accountId)) {
          setCount((shown) => shown + event.newInbound)
        }
      }),
    [],
  )

  useEffect(() => {
    if (count === 0) {
      return
    }
    const timer = setTimeout(() => setCount(0), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [count])

  return { count, dismiss: () => setCount(0) }
}
