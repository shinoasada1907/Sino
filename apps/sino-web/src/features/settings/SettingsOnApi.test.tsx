import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetSettingsBackend, settingsBackend } from '@/test/fixtures/settingsApi'
import { stubViewport } from '@/test/matchMedia'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import { DEFAULT_SETTINGS } from './settings.api'

// settings-backend SB-10, SB-11: the Cài đặt screen on the saved settings (spec user-settings, D-405, D-406).
const html = document.documentElement
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })
const combobox = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement
const optionLabels = (name: string) => Array.from(combobox(name).options).map((option) => option.textContent)

/** Opens /settings at 1440 px; resolves once the saved settings are on screen (the controls are no longer locked). */
async function open() {
  stubViewport(1440)
  const view = renderApp('/settings')
  await waitFor(() => expect(combobox('Định dạng ngày giờ')).toBeEnabled())
  return view
}

describe('the settings screen on the saved settings', () => {
  beforeEach(() => {
    localStorage.clear()
    html.className = ''
  })

  it('shows what is saved, with a value the canvas does not list added to its select', async () => {
    resetSettingsBackend({
      ...DEFAULT_SETTINGS,
      dateFormat: 'ISO',
      motion: 'REDUCED',
      notifications: { ...DEFAULT_SETTINGS.notifications, importantOnly: true, newRegistrations: false },
      quietHours: null,
      timeZone: 'Europe/Paris',
      morningTime: '07:00',
      defaultReminderMinutes: 120,
      weekStart: 'SUNDAY',
    })
    await open()

    expect(combobox('Định dạng ngày giờ')).toHaveValue('ISO')
    expect(within(screen.getByRole('group', { name: 'Mức chuyển động' })).getByRole('button', { name: 'Giảm' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('switch', { name: 'Chỉ từ người quan trọng' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Đăng ký mới được phát hiện' })).not.toBeChecked()
    expect(combobox('Giờ yên lặng')).toHaveValue('off')
    expect(combobox('Múi giờ')).toHaveValue('Europe/Paris')
    expect(combobox('“Sáng mai” nghĩa là')).toHaveValue('07:00')
    expect(combobox('Nhắc mặc định cho lịch hẹn')).toHaveValue('120')
    expect(optionLabels('Nhắc mặc định cho lịch hẹn')).toContain('2 giờ trước')
    expect(combobox('Tuần bắt đầu từ')).toHaveValue('SUNDAY')
  })

  it('saves each change by itself and still has it after a reload', async () => {
    const first = await open()
    const user = userEvent.setup()

    await user.selectOptions(combobox('Định dạng ngày giờ'), '2026-10-02 · 14:05')
    await user.click(screen.getByRole('switch', { name: 'Đăng ký mới được phát hiện' }))
    await user.selectOptions(combobox('Giờ yên lặng'), 'Tắt')
    await user.selectOptions(combobox('Nhắc mặc định cho lịch hẹn'), 'Không nhắc')
    await user.click(within(screen.getByRole('group', { name: 'Mức chuyển động' })).getByRole('button', { name: 'Tắt' }))

    await waitFor(() =>
      expect(settingsBackend.patches()).toEqual([
        { dateFormat: 'ISO' },
        { notifications: { newRegistrations: false } },
        { quietHours: null },
        { defaultReminderMinutes: null },
        { motion: 'OFF' },
      ]),
    )
    first.unmount()

    await open()
    expect(combobox('Định dạng ngày giờ')).toHaveValue('ISO')
    expect(screen.getByRole('switch', { name: 'Đăng ký mới được phát hiện' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Thư và tin nhắn mới' })).toBeChecked()
    expect(combobox('Giờ yên lặng')).toHaveValue('off')
  })

  it('puts a refused change back and says so under that setting only', async () => {
    await open()
    server.use(http.patch('/api/settings', () => problem({ code: 'VALIDATION_FAILED', errors: [{ field: 'notifications.syncErrors', message: 'x' }] }, 400)))
    const user = userEvent.setup()
    const syncErrors = screen.getByRole('switch', { name: 'Lỗi đồng bộ và tài khoản cần đăng nhập lại' })

    await user.click(syncErrors)

    await waitFor(() => expect(syncErrors).toBeChecked())
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Không lưu được. Hãy thử lại.')
  })

  it('locks the settings on the defaults when they cannot be read, and reads them again on "Thử lại"', async () => {
    server.use(http.get('/api/settings', () => problem({ code: 'INTERNAL_ERROR' }, 500), { once: true }))
    stubViewport(1440)
    renderApp('/settings')
    const user = userEvent.setup()

    expect(await screen.findByText('Không tải được cài đặt đã lưu.')).toBeInTheDocument()
    expect(combobox('Định dạng ngày giờ')).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Thư và tin nhắn mới' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Thử lại' }))

    await waitFor(() => expect(combobox('Định dạng ngày giờ')).toBeEnabled())
    expect(screen.queryByText('Không tải được cài đặt đã lưu.')).toBeNull()
  })

  it('says how much Sino keeps, from the server', async () => {
    await open()

    // The numbers sit in spans of their own (tabular figures), so the whole section's text is read.
    await waitFor(() => expect(screen.getByRole('region', { name: 'Quyền riêng tư và dữ liệu' })).toHaveTextContent('3.912 thư và tin nhắn · 412 MB'))
  })

  it('says when that cannot be counted', async () => {
    server.use(http.get('/api/settings/storage', () => problem({ code: 'INTERNAL_ERROR' }, 500)))
    await open()

    expect(await within(screen.getByRole('region', { name: 'Quyền riêng tư và dữ liệu' })).findByText('Chưa tính được.')).toBeInTheDocument()
  })
})

describe('the theme saved on the server (D-405)', () => {
  beforeEach(() => {
    localStorage.clear()
    html.className = ''
  })

  it('is taken by a browser that never chose one', async () => {
    resetSettingsBackend({ ...DEFAULT_SETTINGS, theme: 'DARK' })
    renderApp('/overview')

    await waitFor(() => expect(html).toHaveClass('theme-dark'))
    expect(localStorage.getItem('sino.theme')).toBe('dark')
    expect(settingsBackend.patches()).toEqual([])
  })

  it('gives way to the choice this browser made, which is saved', async () => {
    localStorage.setItem('sino.theme', 'light')
    resetSettingsBackend({ ...DEFAULT_SETTINGS, theme: 'DARK' })
    renderApp('/overview')

    await waitFor(() => expect(settingsBackend.patches()).toEqual([{ theme: 'LIGHT' }]))
    expect(html).toHaveClass('theme-light')
  })

  it('saves a theme picked on the screen', async () => {
    await open()
    const user = userEvent.setup()

    await user.click(within(screen.getByRole('region', { name: 'Giao diện' })).getByRole('button', { name: 'Tối' }))

    await waitFor(() => expect(settingsBackend.saved().theme).toBe('DARK'))
    expect(html).toHaveClass('theme-dark')
  })
})
