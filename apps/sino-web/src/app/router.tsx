import type { RouteObject } from 'react-router'
import { AccountDetailPage } from '@/features/accounts/AccountDetailPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { InboxPage } from '@/features/inbox/InboxPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { NotesPage } from '@/features/notes/NotesPage'
import { HomeGate } from '@/features/public/HomeGate'
import { PrivacyRoute } from '@/features/public/PrivacyRoute'
import { TasksPage } from '@/features/tasks/TasksPage'
import { NotFoundPage } from './NotFoundPage'
import { MorePage } from './shell/MorePage'
import { AppShell, type ShellHandle } from './shell/AppShell'
import { PAGES } from './shell/navItems'
import { UnderConstructionPage } from './UnderConstructionPage'

/** Screens already built, with what they ask of the shell; every other page shows the under-construction page (D-42). */
const SCREENS: Record<string, { element: RouteObject['element']; handle?: ShellHandle }> = {
  '/overview': { element: <OverviewPage /> },
  // Keyed by kind: going from one screen to the other starts afresh (its notice, its read guard), as two screens should.
  '/messages': { element: <InboxPage key="CHAT" kind="CHAT" />, handle: { mobilePageHeader: true } },
  '/inbox': { element: <InboxPage key="EMAIL" kind="EMAIL" />, handle: { mobilePageHeader: true } },
  '/accounts': { element: <AccountsPage />, handle: { mobilePageHeader: true } },
  '/tasks': { element: <TasksPage />, handle: { mobilePageHeader: true } },
  '/notes': { element: <NotesPage />, handle: { mobilePageHeader: true } },
  '/calendar': { element: <CalendarPage />, handle: { mobilePageHeader: true } },
  '/more': { element: <MorePage />, handle: { mobilePageHeader: true } },
}

// Every page sits behind RequireAuth except sign-in, 404 and the public pages (spec web-app-foundation, web-public-pages).
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  // The Sino Messages page for a visitor, Tổng quan for the owner (D-310).
  { path: '/', element: <HomeGate /> },
  { path: '/privacy', element: <PrivacyRoute lang="vi" /> },
  { path: '/en/privacy', element: <PrivacyRoute lang="en" /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          ...PAGES.map(({ to, title }) => ({
            path: to.slice(1),
            ...(SCREENS[to] ?? { element: <UnderConstructionPage title={title} /> }),
          })),
          {
            path: 'inbox/new',
            element: <InboxPage key="EMAIL" kind="EMAIL" compose />,
            handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
          },
          {
            path: 'messages/:conversationId',
            element: <InboxPage key="CHAT" kind="CHAT" />,
            handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
          },
          {
            path: 'inbox/:conversationId',
            element: <InboxPage key="EMAIL" kind="EMAIL" />,
            handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
          },
          {
            path: 'calendar/:itemId',
            element: <CalendarPage />,
            handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
          },
          {
            path: 'tasks/:taskId',
            element: <TasksPage />,
            handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
          },
          {
            path: 'tasks/:taskId/edit',
            element: <TasksPage />,
            handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
          },
          {
            path: 'notes/new',
            element: <NotesPage />,
            handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
          },
          {
            path: 'notes/:noteId',
            element: <NotesPage />,
            handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
          },
          {
            path: 'accounts/:accountId',
            element: <AccountDetailPage />,
            handle: { mobilePageHeader: true, hideTabBar: true } satisfies ShellHandle,
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
