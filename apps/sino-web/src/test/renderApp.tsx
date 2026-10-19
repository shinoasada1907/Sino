import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
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
import { filterConversations } from '@/features/inbox/format'
import { unreadByKindOf } from '@/features/inbox/inbox.api'
import { createInboxSample, frameOf, type InboxSample } from '@/features/inbox/inbox.sample'
import { conversationsKey, INBOX_UNREAD_QUERY_KEY, inboxKey } from '@/features/inbox/useInbox'
import { VIEWS } from '@/features/inbox/useInboxFilter'
import { createOverviewSample } from '@/features/overview/overview.sample'
import type { OverviewData } from '@/features/overview/overview.types'
import { OVERVIEW_QUERY_KEY } from '@/features/overview/useOverview'
import { createTasksSample } from '@/features/tasks/tasks.sample'
import type { TasksData } from '@/features/tasks/tasks.types'
import { TASKS_QUERY_KEY } from '@/features/tasks/useTasks'
import { serveInboxSample } from './inboxSampleApi'

const SIGNED_IN: Me = { email: 'an.nguyen@gmail.com', displayName: 'An Nguyễn' }

/**
 * Renders the whole app at `path` with the given shell, overview, accounts, inbox and tasks data already in the query
 * cache; `inbox: null`, `accounts: null` and `tasks: null` leave those screens to their requests (answered by MSW, or to see them loading or
 * failing), and `shell: null` leaves the shell data to what the app has of its own today (`useShellData`). The inbox sample fills the frame and one page of every view and source; a test file that mocks inbox.api
 * with `sampleInboxApi` gets its later requests answered from the same sample. The owner is signed in unless `me`
 * says otherwise: `null` is signed out, `'request'` leaves the sign-in check to its request (answered by MSW).
 */
export function renderApp(
  path: string,
  {
    shell = createShellSample(new Date()),
    overview = createOverviewSample(new Date()),
    accounts = createAccountsSample(new Date()),
    inbox = createInboxSample(new Date()),
    tasks = createTasksSample(new Date()),
    me = SIGNED_IN,
  }: {
    shell?: ShellData | null
    overview?: OverviewData
    accounts?: AccountsData | null
    inbox?: InboxSample | null
    tasks?: TasksData | null
    me?: Me | null | 'request'
  } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (shell) {
    queryClient.setQueryData(SHELL_QUERY_KEY, shell)
  }
  queryClient.setQueryData(OVERVIEW_QUERY_KEY, overview)
  if (accounts) {
    queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accounts)
  }
  if (inbox) {
    seedInbox(queryClient, inbox)
  }
  serveInboxSample(inbox ?? createInboxSample(new Date()))
  if (tasks) {
    queryClient.setQueryData(TASKS_QUERY_KEY, tasks)
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

// Each screen has its frame and its lists, of its kind only (f05c).
function seedInbox(queryClient: QueryClient, sample: InboxSample) {
  queryClient.setQueryData(INBOX_UNREAD_QUERY_KEY, unreadByKindOf(sample.counts))
  for (const kind of ['EMAIL', 'CHAT'] as const) {
    queryClient.setQueryData(inboxKey(kind), frameOf(sample, kind))
    const conversations = sample.conversations.filter((item) => item.kind === kind)
    for (const source of [null, ...sample.providers.filter((provider) => provider.kind === kind).map((provider) => provider.type)]) {
      for (const view of VIEWS) {
        const items = filterConversations(conversations, { view, source }, new Date())
        queryClient.setQueryData(conversationsKey(kind, { view, source }), { pages: [{ items, nextCursor: null }], pageParams: [null] })
      }
    }
  }
}

/** The element of one shell part (`sidebar`, `rail`, `tabbar`, `topbar`, `notice-bar`); all are in the DOM because jsdom ignores CSS. */
export function shellPart(name: 'sidebar' | 'rail' | 'tabbar' | 'topbar' | 'notice-bar'): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-slot="${name}"]`)
  if (!element) {
    throw new Error(`No [data-slot="${name}"] in the page`)
  }
  return element
}
