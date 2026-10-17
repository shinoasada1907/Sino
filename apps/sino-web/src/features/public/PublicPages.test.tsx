import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// The public pages load on their own (React.lazy, D-313); loading them here keeps that time out of each test.
beforeAll(() => import('./PublicPages'), 30_000)

const OPEN_APP = 'Mở Sino Messages'
/** The top bar of a public page: the one banner with "Mở Sino Messages" in it. */
const topBar = async () => within((await screen.findByRole('link', { name: OPEN_APP })).closest('header')!)

describe('/ of sino-web (WP-01, web-public-pages, D-310)', () => {
  it('shows the Sino Messages page to a visitor who is not signed in, outside the app', async () => {
    const { router } = renderApp('/', { me: null })

    const bar = await topBar()
    expect(router.state.location.pathname).toBe('/')
    expect(bar.getByRole('link', { name: 'Sino' })).toHaveAttribute('href', '/')
    expect(bar.getAllByRole('link', { name: 'Đăng nhập' })[0]).toHaveAttribute('href', '/login')
    expect(bar.getByRole('link', { name: OPEN_APP })).toHaveAttribute('href', '/overview')
    expect(screen.getByText(`© ${new Date().getFullYear()} SINO`)).toBeInTheDocument()
    expect(document.querySelector('[data-slot="sidebar"]')).toBeNull()
    expect(document.title).toBe('Sino Messages · Hộp thư chung cho Gmail và việc cần làm')
  })

  it('sends a signed-in owner on to /overview without a history entry', async () => {
    const { router } = renderApp('/')

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/overview'))
    expect(router.state.historyAction).toBe('REPLACE')
    expect(screen.queryByRole('link', { name: OPEN_APP })).toBeNull()
  })

  it('shows only the session check while it asks who is signed in', async () => {
    server.use(http.get('/api/auth/me', () => new Promise<never>(() => {})))
    renderApp('/', { me: 'request' })

    expect(await screen.findByRole('status', { name: 'Đang kiểm tra đăng nhập' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: OPEN_APP })).toBeNull()
  })

  it('still shows the page when the server cannot be reached', async () => {
    server.use(http.get('/api/auth/me', () => HttpResponse.error()))
    renderApp('/', { me: 'request' })

    expect(await topBar()).toBeDefined()
  })

  it('opens the app from the page; not signed in, that is the sign-in page', async () => {
    const user = userEvent.setup()
    const before = document.title
    const { router } = renderApp('/', { me: null })

    await user.click((await topBar()).getByRole('link', { name: OPEN_APP }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?returnTo=%2Foverview')
    // The tab title of the public page goes with it.
    expect(document.title).toBe(before)
  })

  it('closes the phone menu when one of its links is followed', async () => {
    const user = userEvent.setup()
    renderApp('/', { me: null })

    const bar = await topBar()
    const menu = bar.getByLabelText('Mở menu').closest('details')!
    await user.click(bar.getByLabelText('Mở menu'))
    expect(menu).toHaveAttribute('open')
    await user.click(within(bar.getByRole('navigation', { name: 'Menu' })).getByRole('link', { name: 'Câu hỏi' }))

    expect(menu).not.toHaveAttribute('open')
  })
})
