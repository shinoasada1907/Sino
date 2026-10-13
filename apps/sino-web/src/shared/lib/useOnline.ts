import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange)
const isOnline = () => onlineManager.isOnline()

/**
 * Whether the app is online, as TanStack Query sees it: the same signal that pauses requests and mutations while
 * offline, so what the page says and what the requests do never disagree (D-55).
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline)
}
