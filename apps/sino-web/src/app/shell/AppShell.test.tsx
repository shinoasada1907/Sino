import { act, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp, shellPart } from '@/test/renderApp'
import { createShellSample } from './shell.sample'
import type { ShellData } from './shell.types'
import { SHELL_QUERY_KEY } from './useShellData'

function shellWith(change: (shell: ShellData) => void): ShellData {
  const shell = createShellSample(new Date())
  change(shell)
  return shell
}

describe('sidebar (desktop)', () => {
  it('links every main screen', async () => {
    renderApp('/overview')
    const sidebar = within(shellPart('sidebar'))
    await sidebar.findByText('An Nguyễn')

    const expected: [string | RegExp, string][] = [
      [/^Tổng quan/, '/overview'],
      [/^Hộp thư/, '/inbox'],
      ['Lịch', '/calendar'],
      [/^Việc cần làm/, '/tasks'],
      ['Ghi chú', '/notes'],
      [/^Tài khoản/, '/accounts'],
      ['Dịch vụ', '/services'],
      [/^Đăng ký/, '/registrations'],
      ['Cài đặt', '/settings'],
    ]
    for (const [name, href] of expected) {
      expect(sidebar.getByRole('link', { name })).toHaveAttribute('href', href)
    }
    expect(sidebar.getByText('KẾ HOẠCH')).toBeInTheDocument()
    expect(sidebar.getByText('DANH TÍNH')).toBeInTheDocument()
  })

  it('marks only the open screen as current', async () => {
    renderApp('/overview')
    const sidebar = within(shellPart('sidebar'))

    expect(await sidebar.findByRole('link', { name: /^Tổng quan/ })).toHaveAttribute('aria-current', 'page')
    expect(sidebar.getByRole('link', { name: /^Hộp thư/ })).not.toHaveAttribute('aria-current')
  })

  it('takes the counts and the owner from the shell data', async () => {
    renderApp('/overview', {
      shell: shellWith((s) => {
        s.navCounts.inboxUnread = 5
        s.navCounts.tasksOpen = 7
        s.owner.displayName = 'Bình Trần'
        s.accountCount = 2
      }),
    })
    const sidebar = within(shellPart('sidebar'))

    expect(await sidebar.findByRole('link', { name: 'Hộp thư, 5 chưa đọc' })).toBeInTheDocument()
    expect(sidebar.getByRole('link', { name: 'Việc cần làm, 7 chưa xong' })).toBeInTheDocument()
    expect(sidebar.getByText('Bình Trần')).toBeInTheDocument()
    expect(sidebar.getByText('2 tài khoản')).toBeInTheDocument()
  })

  it('shows no count when it is zero', async () => {
    renderApp('/overview', { shell: shellWith((s) => (s.navCounts.inboxUnread = 0)) })

    expect(await within(shellPart('sidebar')).findByRole('link', { name: 'Hộp thư' })).toBeInTheDocument()
  })
})

describe('rail (tablet)', () => {
  it('names each icon-only link, with what needs attention', async () => {
    renderApp('/overview')
    const rail = within(shellPart('rail'))

    expect(await rail.findByRole('link', { name: 'Hộp thư, 12 chưa đọc' })).toHaveAttribute('href', '/inbox')
    expect(rail.getByRole('link', { name: 'Việc cần làm, 1 quá hạn' })).toHaveAttribute('href', '/tasks')
    expect(rail.getByRole('link', { name: 'Tài khoản, 1 cần xử lý' })).toHaveAttribute('href', '/accounts')
    expect(rail.getByRole('link', { name: 'Lịch' })).toHaveAttribute('href', '/calendar')
    expect(rail.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
  })

  it('says nothing extra when nothing needs attention', async () => {
    renderApp('/overview', { shell: shellWith((s) => (s.navCounts = { inboxUnread: 0, tasksOpen: 0, tasksOverdue: 0, accountsNeedingAction: 0, registrationsNew: 0 })) })
    const rail = within(shellPart('rail'))
    const tabbar = within(shellPart('tabbar'))

    expect(await rail.findByRole('link', { name: 'Hộp thư' })).toBeInTheDocument()
    expect(rail.getByRole('link', { name: 'Việc cần làm' })).toBeInTheDocument()
    expect(tabbar.getByRole('link', { name: 'Hộp thư' })).toBeInTheDocument()
    expect(tabbar.getByRole('link', { name: 'Việc' })).toBeInTheDocument()
  })
})

describe('tab bar (mobile)', () => {
  it('has the five mobile tabs, with the unread count on Hộp thư', async () => {
    renderApp('/overview')
    const tabbar = within(shellPart('tabbar'))

    expect(await tabbar.findByRole('link', { name: 'Hộp thư, 12 chưa đọc' })).toHaveAttribute('href', '/inbox')
    expect(tabbar.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
    expect(tabbar.getByRole('link', { name: 'Lịch' })).toHaveAttribute('href', '/calendar')
    expect(tabbar.getByRole('link', { name: 'Việc, 1 quá hạn' })).toHaveAttribute('href', '/tasks')
    expect(tabbar.getByRole('link', { name: 'Thêm' })).toHaveAttribute('href', '/more')
    expect(tabbar.getAllByRole('link')).toHaveLength(5)
  })
})

describe('top bar', () => {
  it('shows when the last sync was', async () => {
    renderApp('/overview')

    expect(await within(shellPart('topbar')).findAllByText('Đồng bộ 2 phút trước')).not.toHaveLength(0)
  })

  it('measures the time since the last sync when it renders, not when the shell first appeared', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-02T07:00:00Z'))
      const { queryClient } = renderApp('/overview', {
        shell: shellWith((s) => (s.sync = { state: 'SYNCING', lastSyncedAt: null, progress: 10 })),
      })
      await within(shellPart('topbar')).findAllByText('Đang đồng bộ lần đầu · 10%')

      vi.setSystemTime(new Date('2026-10-02T07:00:50Z'))
      act(() => queryClient.setQueryData(SHELL_QUERY_KEY, shellWith((s) => (s.sync = { state: 'OK', lastSyncedAt: '2026-10-02T06:58:50Z', progress: null }))))

      expect(await within(shellPart('topbar')).findAllByText('Đồng bộ 2 phút trước')).not.toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the progress of a first sync', async () => {
    renderApp('/overview', { shell: shellWith((s) => (s.sync = { state: 'SYNCING', lastSyncedAt: null, progress: 35 })) })

    expect(await within(shellPart('topbar')).findAllByText('Đang đồng bộ lần đầu · 35%')).not.toHaveLength(0)
  })

  it('says when no source is connected yet', async () => {
    renderApp('/overview', { shell: shellWith((s) => (s.sync = { state: 'IDLE', lastSyncedAt: null, progress: null })) })

    expect(await within(shellPart('topbar')).findAllByText('Chưa có nguồn nào')).not.toHaveLength(0)
  })

  it('says no source is connected once every account is gone, even after earlier syncs', async () => {
    renderApp('/overview', {
      shell: shellWith((s) => (s.sync = { state: 'IDLE', lastSyncedAt: new Date(Date.now() - 3_600_000).toISOString(), progress: null })),
    })

    expect(await within(shellPart('topbar')).findAllByText('Chưa có nguồn nào')).not.toHaveLength(0)
  })

  it('links the bell to the notifications with the unread count, and offers the theme switch', async () => {
    renderApp('/overview')
    const topbar = within(shellPart('topbar'))

    const bells = await topbar.findAllByRole('link', { name: 'Thông báo, 3 mới' })
    for (const bell of bells) {
      expect(bell).toHaveAttribute('href', '/notifications')
    }
    expect(topbar.getAllByRole('button', { name: /Chuyển sang giao diện/ })).not.toHaveLength(0)
    expect(topbar.getByRole('searchbox', { name: 'Tìm trong Sino' })).toBeInTheDocument()
  })

  it('has no language switch while the app is Vietnamese only', async () => {
    renderApp('/overview')
    await within(shellPart('topbar')).findAllByRole('link', { name: /Thông báo/ })

    expect(screen.queryByRole('button', { name: /Ngôn ngữ/ })).toBeNull()
  })
})
