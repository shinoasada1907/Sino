import { useEffect, useState } from 'react'
import { onConversationsChanged } from '@/shared/realtime/streamState'

// How long "N thư mới" stays after the last new mail.
const NOTICE_MS = 6000

/**
 * "N thư mới" (D-92): the new emails brought by background sync since the notice last showed; imports and the user's own
 * changes do not count. It hides 6 s after the last one, or when dismissed.
 */
export function useNewMailNotice(): { count: number; dismiss: () => void } {
  const [count, setCount] = useState(0)

  useEffect(
    () =>
      onConversationsChanged((event) => {
        if (event.source === 'sync' && event.newInbound > 0) {
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
