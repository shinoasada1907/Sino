import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/renderApp'
import type { OwnerDetails } from './owner'

// The owner details, empty as today or filled with made-up values on reserved names (.example), per test.
const details = vi.hoisted(() => ({ current: {} as OwnerDetails }))
vi.mock('./owner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./owner')>()
  return { ...actual, ownerDetails: () => details.current }
})

const EMPTY: OwnerDetails = { contactEmail: null, owner: null, effectiveDate: null, hosting: null }
const FILLED: OwnerDetails = {
  contactEmail: 'lienhe@sino.example',
  owner: 'Nguyễn Văn Thử',
  effectiveDate: '2026-11-01',
  hosting: 'Máy chủ thử ở Singapore',
}

const LIMITED_USE =
  "Sino Messages' use and transfer to any other app of information received from Google APIs will adhere to Google API Services User Data Policy, including the Limited Use requirements."
const POLICY_URL = 'https://developers.google.com/terms/api-services-user-data-policy'
const SECTIONS = ['tom-tat', 'pham-vi', 'thu-thap', 'su-dung', 'nguoi-xem', 'ben-thu-ba', 'google', 'luu-giu', 'bao-mat', 'quyen', 'thay-doi', 'lien-he']

beforeAll(() => import('./PublicPages'), 30_000)

/** The policy on screen, once its chunk has loaded. */
const open = async (path: '/privacy' | '/en/privacy') => {
  const view = renderApp(path, { me: null })
  await screen.findByRole('heading', { level: 1 })
  return view
}
const part = (id: string) => document.getElementById(id)!
const sectionIds = () => [...document.querySelectorAll('main section[id]')].map((section) => section.id)

describe('the privacy policy in sino-web (WP-03, web-public-pages)', () => {
  beforeEach(() => {
    details.current = FILLED
  })

  it.each([
    ['/privacy', 'vi', 'Chính sách quyền riêng tư · Sino'],
    ['/en/privacy', 'en', 'Privacy policy · Sino'],
  ] as const)('shows %s to anybody, in its language, with its tab title', async (path, lang, title) => {
    const { router } = await open(path)

    expect(router.state.location.pathname).toBe(path)
    expect(document.querySelector('[data-public-page]')).toHaveAttribute('lang', lang)
    expect(document.title).toBe(title)
  })

  it('links one version to the other (spec: Đổi ngôn ngữ)', async () => {
    const user = userEvent.setup()
    const { router } = await open('/privacy')

    await user.click(screen.getByRole('link', { name: 'English' }))

    expect(router.state.location.pathname).toBe('/en/privacy')
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tiếng Việt' })).toHaveAttribute('href', '/privacy')
  })

  it.each(['/privacy', '/en/privacy'] as const)('has the sections of sino-site in %s, each in the table of contents', async (path) => {
    await open(path)

    expect(sectionIds()).toEqual(SECTIONS)
    const toc = within(screen.getByRole('navigation', { name: path === '/privacy' ? 'Mục lục' : 'Contents' }))
    expect(toc.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(SECTIONS.map((id) => `#${id}`))
  })

  it.each(['/privacy', '/en/privacy'] as const)('carries the Limited Use statement word for word and the Google permissions in %s', async (path) => {
    await open(path)

    expect(part('google').textContent).toContain(LIMITED_USE)
    expect([...part('google').querySelectorAll('a')].map((a) => a.getAttribute('href'))).toContain(POLICY_URL)
    expect([...part('google').querySelectorAll('code')].map((code) => code.textContent)).toEqual(['openid', 'email', 'gmail.readonly', 'gmail.send'])
  })

  it('names the owner, the contact address, the host and the date it takes effect', async () => {
    await open('/privacy')

    expect(part('lien-he').textContent).toContain('Nguyễn Văn Thử')
    expect(within(part('lien-he')).getAllByRole('link', { name: 'lienhe@sino.example' })[0]).toHaveAttribute('href', 'mailto:lienhe@sino.example')
    expect(part('ben-thu-ba').textContent).toContain('Máy chủ thử ở Singapore')
    expect(document.querySelector('main header')!.textContent).toContain('01/11/2026')
  })

  it('writes the date the English way in English', async () => {
    await open('/en/privacy')

    expect(document.querySelector('main header')!.textContent).toContain('1 November 2026')
  })

  it('shows what the owner has not filled in yet (spec: Thông tin chưa điền, D-314)', async () => {
    details.current = EMPTY
    await open('/privacy')

    const page = document.querySelector('main')!.textContent
    for (const label of ['email liên hệ', 'người đứng tên', 'ngày hiệu lực', 'nhà cung cấp máy chủ']) {
      expect(page).toContain(`[chưa điền: ${label}]`)
    }
  })

  it.each([
    ['/privacy', 'không dùng cookie', 'cookie chống giả mạo yêu cầu'],
    ['/en/privacy', 'sets no cookies', 'cookie against forged requests'],
  ] as const)('tells in %s that the pages of the app can set its cookie against forged requests (D-316)', async (path, untrue, cookie) => {
    await open(path)

    // In sino-site the pages are a static site with no cookie; here / asks the server who is signed in, and that answer
    // gives the XSRF-TOKEN cookie (spec web-authentication).
    expect(part('pham-vi').textContent).not.toContain(untrue)
    expect(part('pham-vi').textContent).toContain(cookie)
    expect(within(part('pham-vi')).getByRole('link', { name: path === '/privacy' ? 'Dữ liệu Sino lưu' : 'What Sino stores' })).toHaveAttribute('href', '#thu-thap')
  })

  it('does not link to pages sino-web does not have (D-311)', async () => {
    await open('/privacy')

    const hrefs = [...document.querySelectorAll('main a')].map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/security')
    expect(hrefs).not.toContain('/terms')
  })
})
