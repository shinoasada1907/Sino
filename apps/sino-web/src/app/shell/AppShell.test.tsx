import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNTS_QUERY_KEY } from '@/features/accounts/useAccounts'
import { createInboxSample } from '@/features/inbox/inbox.sample'
import { INBOX_UNREAD_QUERY_KEY } from '@/features/inbox/useInbox'
import { createTasksSample } from '@/features/tasks/tasks.sample'
import { publishConversationsChanged } from '@/shared/realtime/streamState'
import { CANVAS_NOW } from '@/shared/time/canvasClock'
import { accountsWithStatus } from '@/test/accountsWithStatus'
import { server } from '@/test/msw/server'
import { renderApp, shellPart } from '@/test/renderApp'
import { createShellSample } from './shell.sample'
import type { ShellData } from './shell.types'
import { SHELL_QUERY_KEY } from './useShellData'

// The counts of Tin nhắn and Hộp thư come from the inbox counts (D-93, f05c), not from the shell data.
function inboxWithUnread(email: number, chat: number) {
  const inbox = createInboxSample(new Date())
  return { ...inbox, counts: { ...inbox.counts, unread: email + chat, unreadByKind: { EMAIL: email, CHAT: chat } } }
}

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
      [/^Tin nhắn/, '/messages'],
      [/^Hộp thư/, '/inbox'],
      ['Lịch', '/calendar'],
      [/^Việc cần làm/, '/tasks'],
      ['Ghi chú', '/notes'],
      ['Sticker', '/stickers'],
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
    // Tin nhắn comes before Hộp thư, right after Tổng quan (f05c, D-300).
    expect(sidebar.getAllByRole('link').slice(0, 3).map((link) => link.getAttribute('href'))).toEqual(['/overview', '/messages', '/inbox'])
  })

  it('marks only the open screen as current', async () => {
    renderApp('/overview')
    const sidebar = within(shellPart('sidebar'))

    expect(await sidebar.findByRole('link', { name: /^Tổng quan/ })).toHaveAttribute('aria-current', 'page')
    expect(sidebar.getByRole('link', { name: /^Hộp thư/ })).not.toHaveAttribute('aria-current')
  })

  // At the moment of the canvas: the sample's rent is due at 17:00 that day, which is the next day once the test runs
  // after 21:05 in Asia/Ho_Chi_Minh.
  it('takes the owner from the shell data, the inbox count from the inbox (D-93), the task count from the tasks (D-83) and the account count from the accounts (D-326)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(CANVAS_NOW)
      const tasks = createTasksSample(new Date())
      renderApp('/overview', {
        inbox: inboxWithUnread(5, 3),
        accounts: accountsWithStatus('CONNECTED', 'CONNECTED'),
        tasks: { ...tasks, tasks: tasks.tasks.filter((task) => task.id !== 'task-bill') },
        shell: shellWith((s) => {
          s.navCounts.inboxUnread = 99
          s.navCounts.messagesUnread = 99
          s.navCounts.tasksDue = 7
          s.owner.displayName = 'Bình Trần'
          s.accountCount = 9
        }),
      })
      const sidebar = within(shellPart('sidebar'))

      expect(await sidebar.findByRole('link', { name: 'Hộp thư, 5 chưa đọc' })).toBeInTheDocument()
      expect(sidebar.getByRole('link', { name: 'Tin nhắn, 3 chưa đọc' })).toBeInTheDocument()
      // The sample has three due tasks, one of them the late bill.
      expect(sidebar.getByRole('link', { name: 'Việc cần làm, 2 tới hạn' })).toBeInTheDocument()
      expect(sidebar.getByText('Bình Trần')).toBeInTheDocument()
      expect(sidebar.getByText('2 tài khoản')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows no count when it is zero', async () => {
    renderApp('/overview', { inbox: inboxWithUnread(0, 0), shell: shellWith((s) => (s.navCounts.inboxUnread = 0)) })
    const sidebar = within(shellPart('sidebar'))

    expect(await sidebar.findByRole('link', { name: 'Hộp thư' })).toBeInTheDocument()
    expect(sidebar.getByRole('link', { name: 'Tin nhắn' })).toBeInTheDocument()
  })

  it('gives Hộp thư every unread and Tin nhắn no number when the backend does not count by kind (spec web-app-shell)', async () => {
    const inbox = createInboxSample(new Date())
    renderApp('/overview', { inbox: { ...inbox, counts: { ...inbox.counts, unread: 12, unreadByKind: null } } })
    const sidebar = within(shellPart('sidebar'))

    expect(await sidebar.findByRole('link', { name: 'Hộp thư, 12 chưa đọc' })).toBeInTheDocument()
    expect(sidebar.getByRole('link', { name: 'Tin nhắn' })).toBeInTheDocument()
  })
})

describe('rail (tablet)', () => {
  it('names each icon-only link, with what needs attention', async () => {
    renderApp('/overview')
    const rail = within(shellPart('rail'))

    expect(await rail.findByRole('link', { name: 'Hộp thư, 7 chưa đọc' })).toHaveAttribute('href', '/inbox')
    expect(rail.getByRole('link', { name: 'Tin nhắn, 5 chưa đọc' })).toHaveAttribute('href', '/messages')
    expect(rail.getByRole('link', { name: 'Việc cần làm, 1 quá hạn' })).toHaveAttribute('href', '/tasks')
    expect(rail.getByRole('link', { name: 'Tài khoản, 1 cần xử lý' })).toHaveAttribute('href', '/accounts')
    expect(rail.getByRole('link', { name: 'Lịch' })).toHaveAttribute('href', '/calendar')
    expect(rail.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
  })

  it('says nothing extra when nothing needs attention', async () => {
    renderApp('/overview', {
      inbox: inboxWithUnread(0, 0),
      tasks: { ...createTasksSample(new Date()), tasks: [] },
      shell: shellWith(
        (s) => (s.navCounts = { messagesUnread: 0, inboxUnread: 0, tasksDue: 0, tasksOverdue: 0, accountsNeedingAction: 0, registrationsNew: 0 }),
      ),
    })
    const rail = within(shellPart('rail'))
    const tabbar = within(shellPart('tabbar'))

    expect(await rail.findByRole('link', { name: 'Hộp thư' })).toBeInTheDocument()
    expect(rail.getByRole('link', { name: 'Tin nhắn' })).toBeInTheDocument()
    expect(rail.getByRole('link', { name: 'Việc cần làm' })).toBeInTheDocument()
    expect(tabbar.getByRole('link', { name: 'Hộp thư' })).toBeInTheDocument()
    expect(tabbar.getByRole('link', { name: 'Tin nhắn' })).toBeInTheDocument()
    expect(tabbar.getByRole('link', { name: 'Việc' })).toBeInTheDocument()
  })
})

describe('tab bar (mobile)', () => {
  it('has the five mobile tabs of the canvas, with the unread of Tin nhắn and Hộp thư (f05c, D-301)', async () => {
    renderApp('/overview')
    const tabbar = within(shellPart('tabbar'))

    expect(await tabbar.findByRole('link', { name: 'Hộp thư, 7 chưa đọc' })).toHaveAttribute('href', '/inbox')
    expect(tabbar.getByRole('link', { name: 'Tin nhắn, 5 chưa đọc' })).toHaveAttribute('href', '/messages')
    expect(tabbar.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
    expect(tabbar.getByRole('link', { name: 'Việc, 1 quá hạn' })).toHaveAttribute('href', '/tasks')
    expect(tabbar.getByRole('link', { name: 'Thêm' })).toHaveAttribute('href', '/more')
    expect(tabbar.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/overview', '/messages', '/inbox', '/tasks', '/more'])
  })

  it('lists Lịch first among the screens behind Thêm', async () => {
    renderApp('/more')
    const others = within(await screen.findByRole('navigation', { name: 'Mục khác' }))

    expect(others.getAllByRole('link')[0]).toHaveAttribute('href', '/calendar')
    expect(others.getAllByRole('link')[0]).toHaveAccessibleName('Lịch')
  })
})

// The Sticker screen of custom-stickers (ST-12, DN-3): in the plan group right after Ghi chú, a row on Thêm, and "Thêm" stays current on it.
describe('the Sticker screen in the navigation (ST-12, DN-3)', () => {
  // The screen reads its library when it opens; an empty one is all these tests need.
  beforeEach(() => server.use(http.get('/api/stickers', () => HttpResponse.json({ items: [] }))))

  it('sits after Ghi chú in the sidebar and the rail, and is marked as current on its screen', async () => {
    renderApp('/stickers')
    const sidebar = within(shellPart('sidebar'))
    const rail = within(shellPart('rail'))

    const current = await sidebar.findByRole('link', { name: 'Sticker' })
    expect(current).toHaveAttribute('href', '/stickers')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(sidebar.getByRole('link', { name: 'Ghi chú' })).not.toHaveAttribute('aria-current')
    const order = (links: HTMLElement[]) => links.map((link) => link.getAttribute('href')).filter((href) => href === '/notes' || href === '/stickers' || href === '/accounts')
    expect(order(sidebar.getAllByRole('link'))).toEqual(['/notes', '/stickers', '/accounts'])
    expect(order(rail.getAllByRole('link'))).toEqual(['/notes', '/stickers', '/accounts'])
    expect(rail.getByRole('link', { name: 'Sticker' })).toHaveAttribute('aria-current', 'page')
  })

  it('has a row on Thêm after Ghi chú, which opens the screen', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/more')
    const others = within(await screen.findByRole('navigation', { name: 'Mục khác' }))

    expect(others.getAllByRole('link').map((link) => link.getAttribute('href'))).toContain('/stickers')
    const hrefs = others.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(hrefs.indexOf('/stickers')).toBe(hrefs.indexOf('/notes') + 1)
    await user.click(others.getByRole('link', { name: 'Sticker' }))

    expect(router.state.location.pathname).toBe('/stickers')
  })

  it('keeps "Thêm" as the current tab on the screen, as on the other screens behind it', async () => {
    renderApp('/stickers')

    expect(await within(shellPart('tabbar')).findByRole('link', { name: 'Thêm' })).toHaveAttribute('aria-current', 'page')
  })

  it('titles the page "Sticker" in the top bar', async () => {
    renderApp('/stickers')

    expect(await within(shellPart('topbar')).findAllByText('Sticker')).not.toHaveLength(0)
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

  it('shows the language switch of the canvas, which does nothing yet', async () => {
    const { router } = renderApp('/overview')
    const switches = await within(shellPart('topbar')).findAllByRole('button', { name: 'Ngôn ngữ: Tiếng Việt' })

    expect(switches).toHaveLength(2) // desktop bar and tablet bar
    await userEvent.click(switches[0])
    expect(router.state.location.pathname).toBe('/overview')
  })

  it('keeps the theme switch on desktop only, as the canvas shows it', async () => {
    renderApp('/overview')
    const topbar = within(shellPart('topbar'))

    expect(await topbar.findAllByRole('button', { name: /Chuyển sang giao diện/ })).toHaveLength(1)
    expect(topbar.getAllByRole('button', { name: 'Tìm kiếm' })).toHaveLength(1)
  })

})

describe('the counts of accounts (NS-01, NS-03, D-321, D-326)', () => {
  // The shell sample says 1; each test gives the list another number, so the two cannot agree by chance.
  it('takes it from the account list, not from the shell data', async () => {
    renderApp('/overview', {
      accounts: accountsWithStatus('AUTH_EXPIRED', 'ERROR', 'CONNECTED'),
      shell: shellWith((s) => (s.navCounts.accountsNeedingAction = 7)),
    })

    expect(await within(shellPart('rail')).findByRole('link', { name: 'Tài khoản, 2 cần xử lý' })).toHaveAttribute('href', '/accounts')
    expect(within(shellPart('sidebar')).getByRole('link', { name: 'Tài khoản, 2 cần xử lý' })).toBeInTheDocument()
  })

  it('shows nothing on Tài khoản when no account needs action, whatever the shell data says', async () => {
    renderApp('/overview', {
      accounts: accountsWithStatus('CONNECTED', 'DEGRADED', 'DISABLED'),
      shell: shellWith((s) => (s.navCounts.accountsNeedingAction = 1)),
    })

    expect(await within(shellPart('rail')).findByRole('link', { name: 'Tài khoản' })).toHaveAttribute('href', '/accounts')
    expect(within(shellPart('sidebar')).getByRole('link', { name: 'Tài khoản' })).toBeInTheDocument()
  })

  it('shows nothing while the account list has not come, rather than the sample count', async () => {
    server.use(http.get('/api/accounts', () => delay('infinite')), http.get('/api/providers', () => delay('infinite')))
    renderApp('/overview', { accounts: null, shell: shellWith((s) => (s.navCounts.accountsNeedingAction = 1)) })

    expect(await within(shellPart('rail')).findByRole('link', { name: 'Tài khoản' })).toBeInTheDocument()
    expect(within(shellPart('sidebar')).getByRole('link', { name: 'Tài khoản' })).toBeInTheDocument()
    // Nor does the foot of the sidebar say how many accounts there are: the sample says 3.
    expect(within(shellPart('sidebar')).queryByText(/tài khoản$/)).not.toBeInTheDocument()
  })

  it('says at the foot of the sidebar how many accounts the list has, and follows it', async () => {
    const { queryClient } = renderApp('/overview', {
      accounts: accountsWithStatus('CONNECTED', 'AUTH_EXPIRED'),
      shell: shellWith((s) => (s.accountCount = 9)),
    })
    const sidebar = within(shellPart('sidebar'))
    expect(await sidebar.findByText('2 tài khoản')).toBeInTheDocument()

    act(() => queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('CONNECTED')))

    expect(await sidebar.findByText('1 tài khoản')).toBeInTheDocument()
  })

  it('follows the list as an account needs the owner and then does not', async () => {
    const { queryClient } = renderApp('/overview', { accounts: accountsWithStatus('CONNECTED', 'AUTH_EXPIRED') })
    const rail = within(shellPart('rail'))
    expect(await rail.findByRole('link', { name: 'Tài khoản, 1 cần xử lý' })).toBeInTheDocument()

    act(() => queryClient.setQueryData(ACCOUNTS_QUERY_KEY, accountsWithStatus('CONNECTED', 'CONNECTED')))

    expect(await rail.findByRole('link', { name: 'Tài khoản' })).toBeInTheDocument()
  })
})

// `shell: null`: the shell data is what the app has of its own today, not a sample handed in by the test.
describe('what has no source yet is not flagged (NS-02, D-325)', () => {
  it('rings no bell: no dot and no count in its name', async () => {
    const { queryClient } = renderApp('/overview', { shell: null })
    const topbar = within(shellPart('topbar'))
    // Before the data comes the bell has no count either; the point is that it has none after.
    await waitFor(() => expect(queryClient.getQueryData(SHELL_QUERY_KEY)).toBeDefined())

    const bells = await topbar.findAllByRole('link', { name: 'Thông báo' })

    expect(bells).toHaveLength(2) // desktop bar and tablet bar
    for (const bell of bells) {
      expect(bell).toHaveAttribute('href', '/notifications')
      expect(bell.querySelector('span')).toBeNull()
    }
    expect(topbar.queryByRole('link', { name: /mới/ })).not.toBeInTheDocument()
  })

  it('flags no new registration on Đăng ký, on any size', async () => {
    const { queryClient } = renderApp('/overview', { shell: null })
    await waitFor(() => expect(queryClient.getQueryData(SHELL_QUERY_KEY)).toBeDefined())

    expect(await within(shellPart('sidebar')).findByRole('link', { name: 'Đăng ký' })).toHaveAttribute('href', '/registrations')
    expect(within(shellPart('sidebar')).queryByRole('link', { name: /^Đăng ký, / })).not.toBeInTheDocument()
  })

  it('still shows the count of the notifications once the data has one', async () => {
    renderApp('/overview', { shell: shellWith((s) => (s.unreadNotifications = 3)) })

    expect(await within(shellPart('topbar')).findAllByRole('link', { name: 'Thông báo, 3 mới' })).toHaveLength(2)
  })
})

describe('the mark on the browser tab (NF-01, D-317)', () => {
  // index.html gives the page its title and its icon; jsdom does not load it.
  let icon: HTMLLinkElement
  beforeEach(() => {
    document.title = 'Sino'
    icon = document.createElement('link')
    icon.rel = 'icon'
    icon.setAttribute('href', '/favicon.svg')
    document.head.append(icon)
  })
  afterEach(() => {
    icon.remove()
    document.title = ''
  })

  it('adds the unread chats and the unread mail up in the title, and puts the dot on the icon', async () => {
    renderApp('/overview', { inbox: inboxWithUnread(2, 1) })

    await waitFor(() => expect(document.title).toBe('(3) Sino'))
    expect(icon).toHaveAttribute('href', '/favicon-unread.svg')
  })

  it('keeps the plain title when nothing is unread', async () => {
    renderApp('/overview', { inbox: inboxWithUnread(0, 0) })

    await screen.findByRole('main')
    expect(document.title).toBe('Sino')
    expect(icon).toHaveAttribute('href', '/favicon.svg')
  })

  it('follows the unread counts as new messages come in', async () => {
    const { queryClient } = renderApp('/overview', { inbox: inboxWithUnread(0, 0) })
    await screen.findByRole('main')

    act(() => queryClient.setQueryData(INBOX_UNREAD_QUERY_KEY, { EMAIL: 1, CHAT: 4 }))

    await waitFor(() => expect(document.title).toBe('(5) Sino'))
  })

  it('counts only the mail while the backend cannot count the chats apart', async () => {
    const { queryClient } = renderApp('/overview', { inbox: inboxWithUnread(0, 0) })
    await screen.findByRole('main')

    act(() => queryClient.setQueryData(INBOX_UNREAD_QUERY_KEY, { EMAIL: 4, CHAT: null }))

    await waitFor(() => expect(document.title).toBe('(4) Sino'))
  })

  it('gives the title back when the owner leaves the app', async () => {
    const { unmount } = renderApp('/overview', { inbox: inboxWithUnread(2, 1) })
    await waitFor(() => expect(document.title).toBe('(3) Sino'))

    unmount()

    expect(document.title).toBe('Sino')
    expect(icon).toHaveAttribute('href', '/favicon.svg')
  })

  it('does not touch the title of a page outside the app', async () => {
    document.title = 'Before'
    renderApp('/login', { me: null })

    await screen.findByRole('heading', { level: 1 })
    expect(document.title).toBe('Before')
  })
})

describe('the bar of new messages (NF-02, D-318, D-319)', () => {
  const sample = createInboxSample(new Date())
  const ZALO = sample.accounts.find((account) => account.provider === 'zalo')!.id
  const sync = (accountId: string, newInbound: number) =>
    act(() => publishConversationsChanged({ accountId, conversationIds: ['c-1'], newInbound, source: 'sync', at: new Date().toISOString() }))

  it('tells a new chat on a screen that is not the list of chats', async () => {
    renderApp('/tasks')
    await screen.findByRole('main')

    sync(ZALO, 1)

    const bar = within(shellPart('notice-bar'))
    expect(await bar.findByText('1 tin mới')).toBeInTheDocument()
    expect(bar.getByRole('link', { name: /^Xem/ })).toHaveAttribute('href', '/messages')
  })

  it('sits between the top bar and the page', async () => {
    renderApp('/tasks')
    const main = await screen.findByRole('main')

    const bar = shellPart('notice-bar')

    expect(shellPart('topbar').compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bar.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('goes to the list and lets the notice go when "Xem" is pressed', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/tasks')
    await screen.findByRole('main')
    sync(ZALO, 2)
    const bar = within(shellPart('notice-bar'))

    await user.click(await bar.findByRole('link', { name: /^Xem/ }))

    expect(router.state.location.pathname).toBe('/messages')
    expect(bar.queryByText(/mới/)).not.toBeInTheDocument()
  })

  it('leaves the open list to its own notice', async () => {
    renderApp('/messages')
    await screen.findByRole('main')

    sync(ZALO, 1)

    // The list says "1 tin mới" itself (D-92); the bar of the shell stays empty.
    expect(await screen.findByRole('button', { name: '1 tin mới' })).toBeInTheDocument()
    expect(within(shellPart('notice-bar')).queryByText(/mới/)).not.toBeInTheDocument()
  })

  it('closes with its button', async () => {
    const user = userEvent.setup()
    renderApp('/tasks')
    await screen.findByRole('main')
    sync(ZALO, 1)
    const bar = within(shellPart('notice-bar'))

    await user.click(await bar.findByRole('button', { name: /^Đóng thông báo/ }))

    expect(bar.queryByText(/mới/)).not.toBeInTheDocument()
  })
})
