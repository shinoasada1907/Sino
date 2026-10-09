import { useSyncExternalStore } from 'react'

/** Where the event stream of the app is (F08): trying to connect, open, or given up by the browser. */
export type StreamState = 'connecting' | 'open' | 'closed'

let state: StreamState = 'connecting'
const listeners = new Set<() => void>()

/** Set by the stream itself (`useEventStream`); screens that would otherwise ask again on a timer read it (D-91). */
export function setStreamState(next: StreamState) {
  if (next !== state) {
    state = next
    listeners.forEach((listener) => listener())
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useStreamState(): StreamState {
  return useSyncExternalStore(subscribe, () => state)
}
