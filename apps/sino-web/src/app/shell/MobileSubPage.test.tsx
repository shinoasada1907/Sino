import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '@/app/providers'
import { ME_QUERY_KEY } from '@/features/auth/useAuth'
import { renderApp, shellPart } from '@/test/renderApp'
import { AppShell } from './AppShell'
import { MobilePageHeader } from './MobilePageHeader'
import { createShellSample } from './shell.sample'
import { SHELL_QUERY_KEY } from './useShellData'

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
  // The owner menu of the shell asks who is signed in.
  queryClient.setQueryData(ME_QUERY_KEY, { email: 'an.nguyen@gmail.com', displayName: 'An Nguyễn' })
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
    for (const path of ['/settings', '/accounts', '/notes', '/more']) {
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
    renderApp('/calendar')

    expect(await within(shellPart('tabbar')).findByRole('link', { name: 'Thêm' })).not.toHaveAttribute('aria-current')
  })
})
