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
import { createInboxSample } from '@/features/inbox/inbox.sample'
import type { InboxData } from '@/features/inbox/inbox.types'
import { INBOX_QUERY_KEY } from '@/features/inbox/useInbox'
import { createOverviewSample } from '@/features/overview/overview.sample'
import type { OverviewData } from '@/features/overview/overview.types'
import { OVERVIEW_QUERY_KEY } from '@/features/overview/useOverview'

/**
 * Renders the whole app at `path` with the given shell, overview, accounts and inbox data already in the query cache;
 * `inbox: null` leaves the inbox to its request (to see it loading or failing).
 */
export function renderApp(
  path: string,
  {
    shell = createShellSample(new Date()),
    overview = createOverviewSample(new Date()),
    accounts = createAccountsSample(new Date()),
    inbox = createInboxSample(new Date()),
  }: { shell?: ShellData; overview?: OverviewData; accounts?: AccountsData; inbox?: InboxData | null } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(SHELL_QUERY_KEY, shell)
  queryClient.setQueryData(OVERVIEW_QUERY_KEY, overview)
  queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accounts)
  if (inbox) {
    queryClient.setQueryData(INBOX_QUERY_KEY, inbox)
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
