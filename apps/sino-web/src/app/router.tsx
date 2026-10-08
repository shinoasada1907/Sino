import { Navigate, type RouteObject } from 'react-router'
import { AccountDetailPage } from '@/features/accounts/AccountDetailPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { InboxPage } from '@/features/inbox/InboxPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { NotFoundPage } from './NotFoundPage'
import { AppShell, type ShellHandle } from './shell/AppShell'
import { PAGES } from './shell/navItems'
import { UnderConstructionPage } from './UnderConstructionPage'

/** Screens already built, with what they ask of the shell; every other page shows the under-construction page (D-42). */
const SCREENS: Record<string, { element: RouteObject['element']; handle?: ShellHandle }> = {
  '/overview': { element: <OverviewPage /> },
  '/inbox': { element: <InboxPage /> },
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
      { path: 'inbox/:conversationId', element: <InboxPage /> },
      {
        path: 'accounts/:accountId',
        element: <AccountDetailPage />,
        handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
