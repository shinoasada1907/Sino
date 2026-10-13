import { Outlet, useLocation, useMatches } from 'react-router'
import { useInboxUnread } from '@/features/inbox/useInbox'
import { navCountsOf } from '@/features/tasks/format'
import { useTasks } from '@/features/tasks/useTasks'
import { useNow } from '@/shared/time/useNow'
import { useEventStream } from '../realtime/useEventStream'
import { PAGES } from './navItems'
import { Rail } from './Rail'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { Topbar } from './Topbar'
import { useShellData } from './useShellData'

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
  const { shell: sample, receivedAt } = useShellData()
  // The inbox count is the real one (D-93), so that new mail changes it; the task counts come from the task list
  // (D-83, FE-70), so every change of a task shows on the navigation; the other counts are still sample data.
  const inboxUnread = useInboxUnread()
  const { tasks } = useTasks()
  // Ticks every minute, so a task due at noon counts as late once noon has passed.
  const now = useNow()
  const navCounts = sample && {
    ...sample.navCounts,
    ...(inboxUnread === undefined ? {} : { inboxUnread }),
    ...(tasks === undefined ? {} : navCountsOf(tasks, now)),
  }
  const shell = sample && navCounts && { ...sample, navCounts }
  const { pathname } = useLocation()
  const handle: ShellHandle = Object.assign({}, ...useMatches().map((match) => (match.handle ?? {}) as ShellHandle))
  // A sub-page such as /accounts/acc-gmail keeps the title of its section.
  const title = PAGES.find((page) => pathname === page.to || pathname.startsWith(`${page.to}/`))?.title ?? 'Sino'

  return (
    <div className="grid h-svh grid-rows-[minmax(0,1fr)_auto] bg-background md:grid-cols-[72px_minmax(0,1fr)] md:grid-rows-1 xl:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar shell={shell} className="hidden xl:flex" />
      <Rail shell={shell} className="hidden md:flex xl:hidden" />
      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
        <Topbar shell={shell} receivedAt={receivedAt} title={title} className={handle.mobilePageHeader ? 'max-md:hidden' : undefined} />
        {/* Row 2 even when a page hides the top bar: a hidden item gives up its row, and main would fall into the auto one. */}
        <main className="row-start-2 min-h-0 overflow-y-auto bg-dots">
          <Outlet />
        </main>
      </div>
      {!handle.hideTabBar && <TabBar shell={shell} className="md:hidden" />}
    </div>
  )
}
