import type { ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { NotFoundPage } from './NotFoundPage'
import { AppShell } from './shell/AppShell'
import { PAGES } from './shell/navItems'
import { UnderConstructionPage } from './UnderConstructionPage'

/** Screens already built; every other page of the shell shows the under-construction page (D-42). */
const SCREENS: Record<string, ReactNode> = {
  '/overview': <OverviewPage />,
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      ...PAGES.map(({ to, title }) => ({
        path: to.slice(1),
        element: SCREENS[to] ?? <UnderConstructionPage title={title} />,
      })),
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
