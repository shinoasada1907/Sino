import { Navigate, type RouteObject } from 'react-router'
import { NotFoundPage } from './NotFoundPage'
import { AppShell } from './shell/AppShell'
import { PAGES } from './shell/navItems'
import { UnderConstructionPage } from './UnderConstructionPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      ...PAGES.map(({ to, title }) => ({ path: to.slice(1), element: <UnderConstructionPage title={title} /> })),
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
