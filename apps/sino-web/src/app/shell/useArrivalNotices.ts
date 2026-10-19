import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { fetchInbox } from '@/features/inbox/inbox.api'
import type { InboxData } from '@/features/inbox/inbox.types'
import { kindOfProvider, SCREENS } from '@/features/inbox/screen'
import { inboxKey } from '@/features/inbox/useInbox'
import { NOTICE_MS } from '@/features/inbox/useNewMailNotice'
import type { ProviderKind } from '@/shared/domain'
import { onConversationsChanged } from '@/shared/realtime/streamState'

/** The new conversations of one kind that background sync brought while the owner was not looking at their list. */
export interface ArrivalNotice {
  kind: ProviderKind
  count: number
}

const KINDS = ['CHAT', 'EMAIL'] as const
// A frame read this recently is believed when it lacks an account: the account is not there, whatever the events say.
const FRAME_FRESH_MS = 30_000
type Counts = Record<ProviderKind, number>
const NONE: Counts = { CHAT: 0, EMAIL: 0 }

/** `/messages` and `/messages/abc`, not `/messages-old`. */
const onScreenOf = (kind: ProviderKind, pathname: string) => pathname === SCREENS[kind].path || pathname.startsWith(`${SCREENS[kind].path}/`)

function useTabVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const change = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  return visible
}

/**
 * Which screen an account belongs to (D-318). An event names the account only; the frame of the inbox knows its provider
 * and the provider's kind. A frame that is already there answers, whichever screen made it: the kind of an account never
 * changes, so an old frame is as good as a new one. Only an account the frames have not seen (just added, or no screen
 * opened yet) costs one read of the frame.
 */
async function kindOfAccount(queryClient: QueryClient, accountId: string): Promise<ProviderKind | undefined> {
  const lookup = (frame: InboxData | undefined) => {
    const account = frame?.accounts.find((item) => item.id === accountId)
    return frame && account ? kindOfProvider(frame.providers, account.provider) : undefined
  }
  for (const kind of KINDS) {
    const known = lookup(queryClient.getQueryData<InboxData>(inboxKey(kind)))
    if (known) {
      return known
    }
  }
  const frame = await queryClient.fetchQuery({ queryKey: inboxKey('CHAT'), queryFn: () => fetchInbox('CHAT'), staleTime: FRAME_FRESH_MS }).catch(() => undefined)
  return lookup(frame)
}

/**
 * "N tin mới" / "N thư mới" for the bar under the top bar of every screen (NF-02, D-318): what background sync brought
 * while the owner was elsewhere in the app, or in another tab. Imports and the owner's own changes do not count (as in
 * D-92), nor does what the open list shows by itself with its own notice. A kind goes when its screen is opened, when it
 * is dismissed, or 6 seconds after the tab shows again on that screen.
 */
export function useArrivalNotices(): { notices: ArrivalNotice[]; dismiss: (kind: ProviderKind) => void } {
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
  const visible = useTabVisible()
  const [counts, setCounts] = useState<Counts>(NONE)
  // Read when an event comes, so that moving about the app does not listen anew.
  const where = useRef({ pathname, visible })
  useEffect(() => {
    where.current = { pathname, visible }
  })

  useEffect(() => {
    let listening = true
    const stop = onConversationsChanged((event) => {
      if (event.source !== 'sync' || event.newInbound <= 0) {
        return
      }
      void kindOfAccount(queryClient, event.accountId).then((kind) => {
        if (!listening || !kind) {
          return
        }
        // The list of that kind is in front of the owner: it has its own notice.
        if (where.current.visible && onScreenOf(kind, where.current.pathname)) {
          return
        }
        setCounts((shown) => ({ ...shown, [kind]: shown[kind] + event.newInbound }))
      })
    })
    return () => {
      listening = false
      stop()
    }
  }, [queryClient])

  // Opening a screen is looking at what its notice points to. Done while rendering, as React advises for a state that follows
  // a value (here the path), not in an effect, which would draw the screen once more with the notice still there.
  const [shownAt, setShownAt] = useState(pathname)
  if (shownAt !== pathname) {
    setShownAt(pathname)
    setCounts((shown) => {
      const seen = KINDS.filter((kind) => shown[kind] > 0 && onScreenOf(kind, pathname))
      return seen.length === 0 ? shown : { ...shown, ...Object.fromEntries(seen.map((kind) => [kind, 0])) }
    })
  }

  // The tab shows again on the screen the notice is about: it has been seen, so it stays only a moment.
  useEffect(() => {
    const seen = KINDS.filter((kind) => counts[kind] > 0 && onScreenOf(kind, pathname))
    if (!visible || seen.length === 0) {
      return
    }
    const timer = setTimeout(() => setCounts((shown) => ({ ...shown, ...Object.fromEntries(seen.map((kind) => [kind, 0])) })), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [visible, pathname, counts])

  return {
    notices: KINDS.filter((kind) => counts[kind] > 0).map((kind) => ({ kind, count: counts[kind] })),
    dismiss: (kind) => setCounts((shown) => ({ ...shown, [kind]: 0 })),
  }
}
