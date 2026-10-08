import { Outlet, useLocation, useMatches } from 'react-router'
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
  const { shell, receivedAt } = useShellData()
  const { pathname } = useLocation()
  const handle: ShellHandle = Object.assign({}, ...useMatches().map((match) => (match.handle ?? {}) as ShellHandle))
  const title = PAGES.find((page) => page.to === pathname)?.title ?? 'Sino'

  return (
    <div className="grid h-svh grid-rows-[minmax(0,1fr)_auto] bg-background md:grid-cols-[72px_minmax(0,1fr)] md:grid-rows-1 xl:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar shell={shell} className="hidden xl:flex" />
      <Rail shell={shell} className="hidden md:flex xl:hidden" />
      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
        <Topbar shell={shell} receivedAt={receivedAt} title={title} className={handle.mobilePageHeader ? 'max-md:hidden' : undefined} />
        <main className="min-h-0 overflow-y-auto bg-dots">
          <Outlet />
        </main>
      </div>
      {!handle.hideTabBar && <TabBar shell={shell} className="md:hidden" />}
    </div>
  )
}
