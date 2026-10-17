import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// The public pages load on their own (React.lazy, D-313); loading them here keeps that time out of each test.
beforeAll(() => import('./PublicPages'), 30_000)

const OPEN_APP = 'Mở Sino Messages'
/** The top bar of a public page, its one banner. */
const topBar = async () => within(await screen.findByRole('banner'))

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

describe('the Sino Messages page at / (WP-02, web-public-pages)', () => {
  it('has the sections of sino-site, each under the id the top bar links to', async () => {
    renderApp('/', { me: null })

    expect(await screen.findByRole('heading', { level: 1, name: 'Mọi hộp thư Gmail ở một nơi. Việc cần làm ngay bên cạnh.' })).toBeInTheDocument()
    const sections: [string, string][] = [
      ['tinh-nang', 'Một hộp thư làm được nhiều hơn đọc thư.'],
      ['ke-hoach', 'Việc cần làm ở ngay cạnh hộp thư.'],
      ['cach-hoat-dong', 'Ba bước, vài phút.'],
      ['rieng-tu', 'Riêng tư là mặc định, không phải một tùy chọn.'],
      ['cau-hoi', 'Trước khi bắt đầu.'],
    ]
    for (const [id, heading] of sections) {
      expect(document.getElementById(id)).toContainElement(screen.getByRole('heading', { level: 2, name: heading }))
    }
    expect(screen.getByRole('heading', { level: 2, name: 'Bớt mở từng hộp thư. Bớt quên việc.' })).toBeInTheDocument()
    // What Sino asks Google for, which Google reads before it verifies the app (sino-site D-245).
    expect([...document.querySelectorAll('[data-slot="scope"] code')].map((code) => code.textContent)).toEqual([
      'openid',
      'email',
      'gmail.readonly',
      'gmail.send',
    ])
  })

  it('links into the app and to the privacy policy of sino-web (D-311)', async () => {
    renderApp('/', { me: null })
    await screen.findByRole('heading', { level: 1 })

    const main = within(screen.getByRole('main'))
    expect(main.getAllByRole('link', { name: 'Mở Sino Messages' }).map((link) => link.getAttribute('href'))).toEqual(['/overview', '/overview'])
    expect(main.getByRole('link', { name: 'Xem cách hoạt động' })).toHaveAttribute('href', '/#cach-hoat-dong')
    expect(main.getByRole('link', { name: 'Mở Việc cần làm' })).toHaveAttribute('href', '/tasks')
    expect(main.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login')
    expect(main.getByRole('link', { name: 'Đọc thêm trong Chính sách quyền riêng tư' })).toHaveAttribute('href', '/privacy#google')
  })

  it('goes to the part of the page the address names, and to the one a top bar link names', async () => {
    const user = userEvent.setup()
    const scrolled: string[] = []
    // jsdom has no scrolling; record which element was asked to come into view.
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id)
    }
    renderApp('/#cau-hoi', { me: null })

    await vi.waitFor(() => expect(scrolled).toEqual(['cau-hoi']))
    const bar = await topBar()
    await user.click(within(bar.getByRole('navigation', { name: 'Các mục của Sino Messages' })).getByRole('link', { name: 'Kế hoạch' }))
    await vi.waitFor(() => expect(scrolled).toEqual(['cau-hoi', 'ke-hoach']))
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })
})
