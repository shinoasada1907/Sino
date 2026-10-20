import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers'
import { createAccountsSample } from '@/features/accounts/accounts.sample'
import { ACCOUNTS_QUERY_KEY } from '@/features/accounts/useAccounts'
import { ME_QUERY_KEY } from '@/features/auth/useAuth'
import { unreadByKindOf } from '@/features/inbox/inbox.api'
import { createInboxSample } from '@/features/inbox/inbox.sample'
import { INBOX_UNREAD_QUERY_KEY } from '@/features/inbox/useInbox'
import { createTasksSample } from '@/features/tasks/tasks.sample'
import { TASKS_QUERY_KEY } from '@/features/tasks/useTasks'
import { renderApp, shellPart } from '@/test/renderApp'
import { AppShell } from './AppShell'
import { MobilePageHeader } from './MobilePageHeader'
import { createShellSample } from './shell.sample'
import { SHELL_QUERY_KEY } from './useShellData'

// The real Ghi chú page is opened below: its requests are answered by the canvas sample (the real API is tested in NotesOnApi.test.tsx).
vi.mock('@/features/notes/notes.api', async (importOriginal) => (await import('@/test/notesSampleApi')).sampleNotesApi(await importOriginal()))

// A route table made for this test: the mechanism is tested on its own, the real pages adopt it later.
const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { path: 'plain', element: <h1>Trang thường</h1> },
      { path: 'notes/:noteId', element: <h1>Một ghi chú</h1> },
      {
        path: 'list',
        handle: { mobilePageHeader: true },
        element: (
          <MobilePageHeader
            back={{ to: '/more', label: 'Quay lại Thêm' }}
            title="Tài khoản"
            subtitle="3 TÀI KHOẢN · 1 CẦN XỬ LÝ"
            action={<button type="button">Thêm tài khoản</button>}
          />
        ),
      },
      {
        path: 'detail',
        handle: { mobilePageHeader: true, hideTabBar: true },
        element: <MobilePageHeader back={{ to: '/list', label: 'Quay lại Tài khoản' }} title="Messenger" />,
      },
    ],
  },
]

function renderAt(path: string) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(SHELL_QUERY_KEY, createShellSample(new Date()))
  // The owner menu of the shell asks who is signed in, its inbox count comes from the inbox (D-93), its task count
  // from the tasks (D-83) and its count of accounts needing action from the accounts (D-321).
  queryClient.setQueryData(ME_QUERY_KEY, { email: 'an.nguyen@gmail.com', displayName: 'An Nguyễn' })
  queryClient.setQueryData(INBOX_UNREAD_QUERY_KEY, unreadByKindOf(createInboxSample(new Date()).counts))
  queryClient.setQueryData(TASKS_QUERY_KEY, createTasksSample(new Date()))
  queryClient.setQueryData(ACCOUNTS_QUERY_KEY, createAccountsSample(new Date()))
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

/** The page's own header: a <header> inside <main> is not a landmark, so it is found through its heading. */
function pageHeader(heading: HTMLElement): HTMLElement {
  const header = heading.closest('header')
  if (!header) {
    throw new Error('The heading is not inside a <header>')
  }
  return header
}

describe('mobile sub-pages', () => {
  it('keeps the shell top bar on an ordinary page', async () => {
    renderAt('/plain')
    await screen.findByRole('heading', { name: 'Trang thường' })

    expect(shellPart('topbar')).not.toHaveClass('max-md:hidden')
    expect(document.querySelector('[data-slot="tabbar"]')).not.toBeNull()
  })

  it('hides the shell top bar on mobile when the page draws its own header', async () => {
    renderAt('/list')
    const header = pageHeader(await screen.findByRole('heading', { level: 1, name: 'Tài khoản' }))

    expect(shellPart('topbar')).toHaveClass('max-md:hidden')
    expect(within(header).getByRole('heading', { level: 1, name: 'Tài khoản' })).toBeInTheDocument()
    expect(within(header).getByText('3 TÀI KHOẢN · 1 CẦN XỬ LÝ')).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Quay lại Thêm' })).toHaveAttribute('href', '/more')
    expect(within(header).getByRole('button', { name: 'Thêm tài khoản' })).toBeInTheDocument()
    expect(header).toHaveClass('md:hidden')
  })

  it('hides the tab bar on a full-screen sub-page', async () => {
    renderAt('/detail')
    pageHeader(await screen.findByRole('heading', { level: 1, name: 'Messenger' }))

    expect(document.querySelector('[data-slot="tabbar"]')).toBeNull()
  })
})

describe('tab bar "Thêm"', () => {
  it('is the current tab on the screens that live under Thêm', async () => {
    // Lịch moved behind Thêm when Tin nhắn took its tab (f05c, D-301).
    for (const path of ['/calendar', '/settings', '/accounts', '/notes', '/more']) {
      const view = renderApp(path)
      const tabbar = within(shellPart('tabbar'))

      expect(await tabbar.findByRole('link', { name: 'Thêm' })).toHaveAttribute('aria-current', 'page')
      expect(tabbar.getByRole('link', { name: 'Tổng quan' })).not.toHaveAttribute('aria-current')
      view.unmount()
    }
  })

  it('stays current on a sub-page of a screen under Thêm that keeps the tab bar', async () => {
    renderAt('/notes/n-1')
    await screen.findByRole('heading', { name: 'Một ghi chú' })

    expect(within(shellPart('tabbar')).getByRole('link', { name: 'Thêm' })).toHaveAttribute('aria-current', 'page')
  })

  it('is not current on a screen that has its own tab', async () => {
    renderApp('/tasks')

    expect(await within(shellPart('tabbar')).findByRole('link', { name: 'Thêm' })).not.toHaveAttribute('aria-current')
  })
})
