import { Navigate, type RouteObject } from 'react-router'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { NotFoundPage } from './NotFoundPage'
import { AppShell, type ShellHandle } from './shell/AppShell'
import { PAGES } from './shell/navItems'
import { UnderConstructionPage } from './UnderConstructionPage'

/** Screens already built, with what they ask of the shell; every other page shows the under-construction page (D-42). */
const SCREENS: Record<string, { element: RouteObject['element']; handle?: ShellHandle }> = {
  '/overview': { element: <OverviewPage /> },
  '/accounts': { element: <AccountsPage />, handle: { mobilePageHeader: true } },
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      ...PAGES.map(({ to, title }) => ({
        path: to.slice(1),
        ...(SCREENS[to] ?? { element: <UnderConstructionPage title={title} /> }),
      })),
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
