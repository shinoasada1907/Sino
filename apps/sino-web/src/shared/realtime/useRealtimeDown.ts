import { useEffect, useState } from 'react'
import { type StreamState, useStreamState } from './streamState'

// A stream closed by the server every 20 minutes opens again within seconds; only a longer loss is worth a word.
const REALTIME_DOWN_MS = 30_000

/**
 * The state of an event stream that has not been open for 30 s (D-94): `connecting` while the browser keeps trying,
 * `closed` once it gave up; null while the stream is open or only briefly lost.
 */
export function useRealtimeDown(): Exclude<StreamState, 'open'> | null {
  const state = useStreamState()
  const [late, setLate] = useState<{ state: StreamState; late: boolean }>({ state, late: false })
  // Each new state waits its own 30 s (read while rendering, as React advises for state that follows an input).
  if (late.state !== state) {
    setLate({ state, late: false })
  }

  useEffect(() => {
    if (state === 'open') {
      return
    }
    const timer = setTimeout(() => setLate({ state, late: true }), REALTIME_DOWN_MS)
    return () => clearTimeout(timer)
  }, [state])

  return state !== 'open' && late.state === state && late.late ? state : null
}
