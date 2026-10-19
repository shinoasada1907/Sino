import { Outlet, useLocation, useMatches } from 'react-router'
import { useUnreadByKind } from '@/features/inbox/useInbox'
import { navCountsOf } from '@/features/tasks/format'
import { useTasks } from '@/features/tasks/useTasks'
import { useNow } from '@/shared/time/useNow'
import { useEventStream } from '../realtime/useEventStream'
import { PAGES } from './navItems'
import { NoticeBar } from './NoticeBar'
import { Rail } from './Rail'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { Topbar } from './Topbar'
import { useArrivalNotices } from './useArrivalNotices'
import { useShellData } from './useShellData'
import { useTabUnread } from './useTabUnread'

// The app frame around every screen. Sidebar >= 1280 px, Rail 768-1279 px, TabBar < 768 px (canvas `Breakpoints`).
/** What a route can ask of the shell through its `handle`. */
export interface ShellHandle {
  /** The page draws its own mobile header (MobilePageHeader), so the shell hides its mobile top bar. */
  mobilePageHeader?: boolean
  /** A full-screen sub-page on mobile: no tab bar. */
  hideTabBar?: boolean
}

export function AppShell() {
  useEventStream()
  const { shell: base, receivedAt } = useShellData()
  // The counts of Tin nhắn and Hộp thư are the real ones (D-93, f05c), so that new mail changes them; the task counts come
  // from the task list (D-83, FE-70), so every change of a task shows on the navigation. The shell data brings the counts
  // of accounts from the account list (D-326) and flags no notification or registration (D-325); the owner and the sync
  // line are still sample data.
  const unread = useUnreadByKind()
  // The browser tab says there is news too (NF-01, D-317): chats and mail together, the chats as 0 while the backend cannot count them.
  useTabUnread(unread && unread.EMAIL + (unread.CHAT ?? 0))
  // And a bar under the top bar says the new messages that came while the owner was elsewhere (NF-02, D-318).
  const { notices, dismiss } = useArrivalNotices()
  const { tasks } = useTasks()
  // Ticks every minute, so a task due at noon counts as late once noon has passed.
  const now = useNow()
  const navCounts = base && {
    ...base.navCounts,
    ...(unread === undefined ? {} : { messagesUnread: unread.CHAT, inboxUnread: unread.EMAIL }),
    ...(tasks === undefined ? {} : navCountsOf(tasks, now)),
  }
  const shell = base && navCounts && { ...base, navCounts }
  const { pathname } = useLocation()
  const handle: ShellHandle = Object.assign({}, ...useMatches().map((match) => (match.handle ?? {}) as ShellHandle))
  // A sub-page such as /accounts/acc-gmail keeps the title of its section.
  const title = PAGES.find((page) => pathname === page.to || pathname.startsWith(`${page.to}/`))?.title ?? 'Sino'

  return (
    <div className="grid h-svh grid-rows-[minmax(0,1fr)_auto] bg-background md:grid-cols-[72px_minmax(0,1fr)] md:grid-rows-1 xl:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar shell={shell} className="hidden xl:flex" />
      <Rail shell={shell} className="hidden md:flex xl:hidden" />
      <div className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)]">
        <Topbar shell={shell} receivedAt={receivedAt} title={title} className={handle.mobilePageHeader ? 'max-md:hidden' : undefined} />
        <NoticeBar notices={notices} onDismiss={dismiss} />
        {/* Row 3 even when a page hides the top bar or there is no notice: a hidden item gives up its row, and main would fall into an auto one. */}
        <main className="row-start-3 min-h-0 overflow-y-auto bg-dots">
          <Outlet />
        </main>
      </div>
      {!handle.hideTabBar && <TabBar shell={shell} className="md:hidden" />}
    </div>
  )
}
