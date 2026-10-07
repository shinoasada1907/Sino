import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp, shellPart } from '@/test/renderApp'

describe('routes', () => {
  it('sends / to /overview', async () => {
    const { router } = renderApp('/')

    expect(await within(shellPart('sidebar')).findByRole('link', { name: /Tổng quan/ })).toHaveAttribute('aria-current', 'page')
    expect(router.state.location.pathname).toBe('/overview')
  })

  it('shows a screen that is not built yet inside the shell, with a way back to Tổng quan', async () => {
    renderApp('/calendar')

    expect(await screen.findByRole('heading', { name: 'Màn Lịch đang được dựng' })).toBeInTheDocument()
    expect(within(shellPart('sidebar')).getByRole('link', { name: 'Lịch' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Về Tổng quan' })).toHaveAttribute('href', '/overview')
  })

  it('opens the screen of a navigation item when it is clicked', async () => {
    const { router } = renderApp('/overview')

    await userEvent.click(await within(shellPart('sidebar')).findByRole('link', { name: 'Ghi chú' }))

    expect(router.state.location.pathname).toBe('/notes')
    expect(await screen.findByRole('heading', { name: 'Màn Ghi chú đang được dựng' })).toBeInTheDocument()
  })

  it('shows the 404 page for an unknown path, outside the shell', async () => {
    renderApp('/khong-co-trang-nay')

    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang này.' })).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về Tổng quan' })).toHaveAttribute('href', '/overview')
    expect(document.querySelector('[data-slot="sidebar"]')).toBeNull()
  })
})
