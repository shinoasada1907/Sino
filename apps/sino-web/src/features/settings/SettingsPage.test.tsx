import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAccountsSample } from '@/features/accounts/accounts.sample'
import { stubOsColorScheme, stubViewport } from '@/test/matchMedia'
import { renderApp } from '@/test/renderApp'

// fe-ui-settings SE-01…SE-03: the Cài đặt screen from 1280 px (spec settings-screen).
const html = document.documentElement
const toc = () => within(screen.getByRole('navigation', { name: 'Mục cài đặt' }))
const section = (name: string) => within(screen.getByRole('region', { name }))

function open(options: Parameters<typeof renderApp>[1] = {}) {
  stubViewport(1440)
  return renderApp('/settings', options)
}

describe('the settings screen', () => {
  beforeEach(() => {
    localStorage.clear()
    html.className = ''
    stubOsColorScheme('light')
  })

  it('has the nine sections of the canvas in order, and a table of contents that marks the one clicked', async () => {
    open()
    const user = userEvent.setup()

    // Two: the page's own and the phone's page header, which CSS hides from 768 px (jsdom does not run CSS).
    expect(await screen.findAllByRole('heading', { level: 1, name: 'Cài đặt' })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Giao diện',
      'Ngôn ngữ',
      'Chuyển động',
      'Thông báo',
      'Lịch và nhắc nhở',
      'Quyền riêng tư và dữ liệu',
      'Nguồn đã kết nối',
      'Bảo mật',
      'Về Sino',
    ])
    const links = toc().getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#giao-dien',
      '#ngon-ngu',
      '#chuyen-dong',
      '#thong-bao',
      '#lich-nhac',
      '#rieng-tu',
      '#nguon',
      // Not a section: the sticker library, inside Cài đặt (SE-04, D-397).
      '/settings/stickers',
      '#bao-mat',
      '#ve-sino',
    ])
    expect(toc().getByRole('link', { name: 'Giao diện' })).toHaveAttribute('aria-current', 'location')

    await user.click(toc().getByRole('link', { name: 'Bảo mật' }))

    expect(toc().getByRole('link', { name: 'Bảo mật' })).toHaveAttribute('aria-current', 'location')
    expect(toc().getByRole('link', { name: 'Giao diện' })).not.toHaveAttribute('aria-current')
  })

  it('says in the table of contents that an account needs action', async () => {
    open()

    expect(await toc().findByRole('link', { name: 'Nguồn đã kết nối, 1 cần xử lý' })).toHaveAttribute('href', '#nguon')
  })

  it('changes the app’s theme for real and remembers it, following the OS when asked', async () => {
    open()
    const user = userEvent.setup()
    const theme = section('Giao diện')

    expect(await theme.findByRole('button', { name: 'Theo hệ thống' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(theme.getByRole('button', { name: 'Tối' }))
    expect(html).toHaveClass('theme-dark')
    expect(localStorage.getItem('sino.theme')).toBe('dark')
    expect(theme.getByRole('button', { name: 'Tối' })).toHaveAttribute('aria-pressed', 'true')

    stubOsColorScheme('light')
    await user.click(theme.getByRole('button', { name: 'Theo hệ thống' }))
    expect(html).toHaveClass('theme-light')
    expect(localStorage.getItem('sino.theme')).toBe('system')
  })

  // Saving them is in SettingsOnApi.test.tsx (settings-backend).
  it('changes the settings on screen at once', async () => {
    open()
    const user = userEvent.setup()

    const registrations = await screen.findByRole('switch', { name: 'Đăng ký mới được phát hiện' })
    await waitFor(() => expect(registrations).toBeEnabled())
    expect(registrations).toBeChecked()
    await user.click(registrations)
    expect(registrations).not.toBeChecked()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Định dạng ngày giờ' }), '2026-10-02 · 14:05')
    expect(screen.getByRole('combobox', { name: 'Định dạng ngày giờ' })).toHaveValue('ISO')

    const motion = within(screen.getByRole('group', { name: 'Mức chuyển động' }))
    await user.click(motion.getByRole('button', { name: 'Giảm' }))
    expect(motion.getByRole('button', { name: 'Giảm' })).toHaveAttribute('aria-pressed', 'true')

    expect(screen.getByRole('combobox', { name: 'Giờ yên lặng' })).toHaveValue('22:00-07:00')
    expect(screen.getByRole('combobox', { name: 'Tuần bắt đầu từ' })).toHaveValue('MONDAY')
    expect(section('Quyền riêng tư và dữ liệu').getByText(/3\.912/)).toBeInTheDocument()
  })

  it('lists the user’s real accounts with their state, and links to the Tài khoản screen', async () => {
    open()
    const sources = section('Nguồn đã kết nối')

    expect(await sources.findByText('an.nguyen@gmail.com')).toBeInTheDocument()
    expect(sources.getByText('an.nguyen.92')).toBeInTheDocument()
    expect(sources.getByText('Cần đăng nhập lại')).toBeInTheDocument()
    expect(sources.getByRole('link', { name: 'Quản lý trong Tài khoản' })).toHaveAttribute('href', '/accounts')
  })

  it('says when no account is connected', async () => {
    open({ accounts: { ...createAccountsSample(new Date()), accounts: [] } })

    expect(await section('Nguồn đã kết nối').findByText('Chưa kết nối tài khoản nào.')).toBeInTheDocument()
  })

  it('links the privacy policy to the public page', async () => {
    open()

    expect(await section('Về Sino').findByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute('href', '/privacy')
  })
})
