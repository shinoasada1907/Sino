import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { INBOX_QUERY_KEY } from '@/features/inbox/useInbox'
import { api } from '@/shared/api/client'
import { server } from '@/test/msw/server'
import { renderApp, shellPart } from '@/test/renderApp'

const problem = (status: number, body: Record<string, unknown>) =>
  HttpResponse.json({ title: 'Error', status, ...body }, { status, headers: { 'Content-Type': 'application/problem+json' } })

describe('the owner menu and the end of a session', () => {
  // A theme switched in one test is saved and would open the next one in dark.
  afterEach(() => localStorage.clear())

  it('shows who is signed in and signs out from the sidebar menu, forgetting what was cached', async () => {
    let signedOut = false
    server.use(
      http.post('/api/auth/logout', () => {
        signedOut = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('/api/auth/me', () => problem(401, { code: 'UNAUTHORIZED' })),
    )
    const { router, queryClient } = renderApp('/inbox')
    const user = userEvent.setup()

    await user.click(within(shellPart('sidebar')).getByRole('button', { name: 'Tài khoản Sino của bạn' }))
    const menu = within(await screen.findByRole('menu'))
    expect(menu.getByText('An Nguyễn')).toBeInTheDocument()
    expect(menu.getByText('an.nguyen@gmail.com')).toBeInTheDocument()
    expect(menu.getByRole('menuitem', { name: 'Giao diện tối' })).toBeInTheDocument()

    await user.click(menu.getByRole('menuitem', { name: 'Đăng xuất' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập vào Sino' })).toBeInTheDocument()
    expect(signedOut).toBe(true)
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('')
    expect(queryClient.getQueryData(INBOX_QUERY_KEY)).toBeUndefined()
  })

  it('signs out all the same when the session was already gone (401)', async () => {
    server.use(
      http.post('/api/auth/logout', () => problem(401, { code: 'UNAUTHORIZED' })),
      http.get('/api/auth/me', () => problem(401, { code: 'UNAUTHORIZED' })),
    )
    const { router } = renderApp('/overview')
    const user = userEvent.setup()

    await user.click(within(shellPart('sidebar')).getByRole('button', { name: 'Tài khoản Sino của bạn' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Đăng xuất' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập vào Sino' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('switches between light and dark from the menu', async () => {
    renderApp('/overview')
    const user = userEvent.setup()

    await user.click(within(shellPart('sidebar')).getByRole('button', { name: 'Tài khoản Sino của bạn' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Giao diện tối' }))

    expect(document.documentElement).toHaveClass('theme-dark')
  })

  it('opens the same menu from the avatar of the rail', async () => {
    renderApp('/overview')
    const user = userEvent.setup()

    await user.click(within(shellPart('rail')).getByRole('button', { name: 'Tài khoản Sino của bạn' }))

    expect(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument()
  })

  it('goes back to sign-in, returning to the same page, when the session ends while the app is open', async () => {
    server.use(http.get('/api/accounts', () => problem(401, { code: 'UNAUTHORIZED' })))
    const { router, queryClient } = renderApp('/accounts')
    await screen.findAllByRole('heading', { level: 1, name: 'Tài khoản' })

    await act(async () => {
      await api.get('/api/accounts').catch(() => undefined)
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập vào Sino' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('?returnTo=%2Faccounts')
    expect(queryClient.getQueryData(INBOX_QUERY_KEY)).toBeUndefined()
  })

  it('gathers the other screens, the theme and signing out on the mobile "Thêm" page', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const { router } = renderApp('/more')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Thêm' })).toBeInTheDocument()
    expect(screen.getByText('an.nguyen@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('3 tài khoản · 1 cần xử lý')).toBeInTheDocument()
    const others = within(screen.getByRole('navigation', { name: 'Mục khác' }))
    expect(others.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/notes',
      '/accounts',
      '/services',
      '/registrations',
      '/notifications',
      '/settings',
    ])
    expect(others.getByRole('link', { name: /Tài khoản/ })).toHaveAccessibleName('Tài khoản, 1 cần xử lý')

    await user.click(within(screen.getByRole('group', { name: 'Giao diện' })).getByRole('button', { name: 'Tối' }))
    expect(document.documentElement).toHaveClass('theme-dark')

    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập vào Sino' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })
})
