import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AppProviders } from '@/app/providers'
import { routes } from '@/app/router'
import { createShellSample } from '@/app/shell/shell.sample'
import type { ShellData } from '@/app/shell/shell.types'
import { SHELL_QUERY_KEY } from '@/app/shell/useShellData'
import { createAccountsSample } from '@/features/accounts/accounts.sample'
import type { AccountsData } from '@/features/accounts/accounts.types'
import { ACCOUNTS_QUERY_KEY } from '@/features/accounts/useAccounts'
import type { Me } from '@/features/auth/auth.api'
import { ME_QUERY_KEY } from '@/features/auth/useAuth'
import { createInboxSample } from '@/features/inbox/inbox.sample'
import type { InboxData } from '@/features/inbox/inbox.types'
import { INBOX_QUERY_KEY } from '@/features/inbox/useInbox'
import { createOverviewSample } from '@/features/overview/overview.sample'
import type { OverviewData } from '@/features/overview/overview.types'
import { OVERVIEW_QUERY_KEY } from '@/features/overview/useOverview'

const SIGNED_IN: Me = { email: 'an.nguyen@gmail.com', displayName: 'An Nguyễn' }

/**
 * Renders the whole app at `path` with the given shell, overview, accounts and inbox data already in the query cache;
 * `inbox: null` leaves the inbox to its request (to see it loading or failing). The owner is signed in unless `me`
 * says otherwise: `null` is signed out, `'request'` leaves the sign-in check to its request (answered by MSW).
 */
export function renderApp(
  path: string,
  {
    shell = createShellSample(new Date()),
    overview = createOverviewSample(new Date()),
    accounts = createAccountsSample(new Date()),
    inbox = createInboxSample(new Date()),
    me = SIGNED_IN,
  }: { shell?: ShellData; overview?: OverviewData; accounts?: AccountsData; inbox?: InboxData | null; me?: Me | null | 'request' } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(SHELL_QUERY_KEY, shell)
  queryClient.setQueryData(OVERVIEW_QUERY_KEY, overview)
  queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accounts)
  if (inbox) {
    queryClient.setQueryData(INBOX_QUERY_KEY, inbox)
  }
  if (me !== 'request') {
    queryClient.setQueryData(ME_QUERY_KEY, me)
  }
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...view, router, queryClient }
}

/** The element of one shell part (`sidebar`, `rail`, `tabbar`, `topbar`); all are in the DOM because jsdom ignores CSS. */
export function shellPart(name: 'sidebar' | 'rail' | 'tabbar' | 'topbar'): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-slot="${name}"]`)
  if (!element) {
    throw new Error(`No [data-slot="${name}"] in the page`)
  }
  return element
}
