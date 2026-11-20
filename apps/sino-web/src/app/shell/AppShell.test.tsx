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
import { stubViewport } from '@/test/matchMedia'
import { server } from '@/test/msw/server'
import { serveEmptyCalendar } from '@/test/fixtures/calendarApi'
import { renderApp, shellPart } from '@/test/renderApp'
import { createShellSample } from './shell.sample'
import type { ShellData } from './shell.types'

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

// The sample tasks move with the clock (`createTasksSample`), and the counts of the navigation read the clock too, so a
// test that counts the late or the due tasks stops it at the moment of the canvas, where the sample shows one late task
// (the bill) and three due. Left to the real clock the count changes with the hour: the rent, due at 17:00, is the next
// day once the test runs after 21:05 in Asia/Ho_Chi_Minh, and the reply due for the whole day moves by whole days
// (`dayClockFrom`), so from 00:00 to 02:05 its day is over and the sample shows a second late task (NS-05).
async function atCanvasMoment(test: () => Promise<void>) {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(CANVAS_NOW)
    await test()
  } finally {
    vi.useRealTimers()
  }
}

// The sidebar is the one of messages-by-account: the mail and the chats by account, then the plan; Tổng quan, Tài khoản, Dịch vụ and
// Đăng ký are on the rail and the tab bar only.
describe('sidebar (desktop)', () => {
  it('links the screens of the sidebar, the mail and the chats by account', async () => {
    renderApp('/overview')
    const sidebar = within(shellPart('sidebar'))
    await sidebar.findAllByText('An Nguyễn')

    const expected: [string | RegExp, string][] = [
      [/^Hộp thư/, '/inbox?account=acc-gmail'],
      ['Đã gửi', '/inbox?folder=sent'],
      ['Thư rác', '/inbox?folder=trash'],
      ['Đã lưu trữ', '/inbox?folder=archive'],
      [/^Zalo, /, '/messages'],
      [/^Messenger/, '/messages?channel=messenger'],
      ['Lịch', '/calendar'],
      [/^Việc cần làm/, '/tasks'],
      ['Ghi chú', '/notes'],
      ['Cài đặt', '/settings'],
      ['Hồ sơ cá nhân', '/profile'],
    ]
    for (const [name, href] of expected) {
      expect(sidebar.getByRole('link', { name })).toHaveAttribute('href', href)
    }
    expect(sidebar.getByText('THƯ ĐIỆN TỬ (GMAIL)')).toBeInTheDocument()
    expect(sidebar.getByText('TIN NHẮN')).toBeInTheDocument()
    expect(sidebar.getByText('KẾ HOẠCH')).toBeInTheDocument()
  })

  it('lists the accounts under their source, and a way to add one', async () => {
    renderApp('/overview')
    const sidebar = within(shellPart('sidebar'))
    await sidebar.findAllByText('An Nguyễn')

    expect(sidebar.getByRole('link', { name: /^an\.nguyen@gmail\.com/ })).toHaveAttribute('href', '/inbox?account=acc-gmail')
    expect(sidebar.getByRole('link', { name: /^An Nguyễn/ })).toHaveAttribute('href', '/messages?account=acc-zalo')
    expect(sidebar.getByRole('link', { name: 'Thêm tài khoản email' })).toHaveAttribute('href', '/accounts?add=gmail')
    expect(sidebar.getByRole('link', { name: 'Thêm tài khoản Zalo' })).toHaveAttribute('href', '/accounts?add=zalo')
    expect(sidebar.getByRole('link', { name: 'Thêm tài khoản Messenger' })).toHaveAttribute('href', '/accounts?add=messenger')
  })

  it('marks only the open screen as current', async () => {
    serveEmptyCalendar()
    renderApp('/calendar')
    const sidebar = within(shellPart('sidebar'))

    expect(await sidebar.findByRole('link', { name: 'Lịch' })).toHaveAttribute('aria-current', 'page')
    expect(sidebar.getByRole('link', { name: 'Ghi chú' })).not.toHaveAttribute('aria-current')
    expect(sidebar.getByRole('link', { name: 'Cài đặt' })).not.toHaveAttribute('aria-current')
  })

  it('takes the owner from the signed-in user, the mail and chat counts from the inbox (D-93), the task count from the tasks (D-83) and the account count from the accounts (D-326)', () =>
    atCanvasMoment(async () => {
      const tasks = createTasksSample(new Date())
      renderApp('/overview', {
        inbox: inboxWithUnread(5, 3),
        accounts: accountsWithStatus('CONNECTED', 'CONNECTED'),
        tasks: { ...tasks, tasks: tasks.tasks.filter((task) => task.id !== 'task-bill') },
        me: { email: 'binh.tran@gmail.com', displayName: 'Bình Trần', avatarUrl: null },
      })
      const sidebar = within(shellPart('sidebar'))

      expect(await sidebar.findByRole('link', { name: 'Hộp thư, 5 chưa đọc' })).toBeInTheDocument()
      expect(sidebar.getByRole('link', { name: 'Zalo, 3 chưa đọc' })).toBeInTheDocument()
      // The sample has three due tasks, one of them the late bill.
      expect(sidebar.getByRole('link', { name: 'Việc cần làm, 2 tới hạn' })).toBeInTheDocument()
      expect(sidebar.getByText('Bình Trần')).toBeInTheDocument()
      expect(sidebar.getByText('2 tài khoản')).toBeInTheDocument()
    }))

  it('shows no count when it is zero', async () => {
    renderApp('/overview', { inbox: inboxWithUnread(0, 0) })
    const sidebar = within(shellPart('sidebar'))

    expect(await sidebar.findByRole('link', { name: 'Hộp thư' })).toBeInTheDocument()
    expect(sidebar.getByRole('link', { name: 'Zalo' })).toBeInTheDocument()
  })

  it('gives Hộp thư every unread and Zalo no number when the backend does not count by kind (spec web-app-shell)', async () => {
    const inbox = createInboxSample(new Date())
    renderApp('/overview', { inbox: { ...inbox, counts: { ...inbox.counts, unread: 12, unreadByKind: null } } })
    const sidebar = within(shellPart('sidebar'))

    expect(await sidebar.findByRole('link', { name: 'Hộp thư, 12 chưa đọc' })).toBeInTheDocument()
    expect(sidebar.getByRole('link', { name: 'Zalo' })).toBeInTheDocument()
  })
})

describe('rail (tablet)', () => {
  it('names each icon-only link, with what needs attention', () =>
    atCanvasMoment(async () => {
      renderApp('/overview')
      const rail = within(shellPart('rail'))

      expect(await rail.findByRole('link', { name: 'Hộp thư, 7 chưa đọc' })).toHaveAttribute('href', '/inbox')
      expect(rail.getByRole('link', { name: 'Tin nhắn, 5 chưa đọc' })).toHaveAttribute('href', '/messages')
      expect(rail.getByRole('link', { name: 'Việc cần làm, 1 quá hạn' })).toHaveAttribute('href', '/tasks')
      expect(rail.getByRole('link', { name: 'Tài khoản, 1 cần xử lý' })).toHaveAttribute('href', '/accounts')
      expect(rail.getByRole('link', { name: 'Lịch' })).toHaveAttribute('href', '/calendar')
      expect(rail.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
    }))

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
  it('has the five mobile tabs of the canvas, with the unread of Tin nhắn and Hộp thư (f05c, D-301)', () =>
    atCanvasMoment(async () => {
      renderApp('/overview')
      const tabbar = within(shellPart('tabbar'))

      expect(await tabbar.findByRole('link', { name: 'Hộp thư, 7 chưa đọc' })).toHaveAttribute('href', '/inbox')
      expect(tabbar.getByRole('link', { name: 'Tin nhắn, 5 chưa đọc' })).toHaveAttribute('href', '/messages')
      expect(tabbar.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
      expect(tabbar.getByRole('link', { name: 'Việc, 1 quá hạn' })).toHaveAttribute('href', '/tasks')
      expect(tabbar.getByRole('link', { name: 'Thêm' })).toHaveAttribute('href', '/more')
      expect(tabbar.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/overview', '/messages', '/inbox', '/tasks', '/more'])
    }))

  it('lists Lịch first among the screens behind Thêm', async () => {
    renderApp('/more')
    const others = within(await screen.findByRole('navigation', { name: 'Mục khác' }))

    expect(others.getAllByRole('link')[0]).toHaveAttribute('href', '/calendar')
    expect(others.getAllByRole('link')[0]).toHaveAccessibleName('Lịch')
  })
})

// The Sticker screen moved into Cài đặt (fe-ui-settings, D-397; it was in the plan group since ST-12, DN-3): no item
// of its own in the sidebar, the rail or Thêm; `/stickers` leads to `/settings/stickers`, under the "Thêm" tab.
describe('the Sticker screen inside Cài đặt (SE-04, D-397)', () => {
  // The screen reads its library when it opens; an empty one is all these tests need.
  // The screen reads the stickers and, since SP-06, the packs.
  beforeEach(() =>
    server.use(
      http.get('/api/stickers', () => HttpResponse.json({ items: [] })),
      http.get('/api/sticker-packs', () => HttpResponse.json({ items: [] })),
    ),
  )

  it('has no item of its own in the sidebar, the rail or Thêm', async () => {
    renderApp('/overview')
    const sidebar = within(shellPart('sidebar'))
    await sidebar.findAllByText('An Nguyễn')

    expect(sidebar.queryByRole('link', { name: 'Sticker' })).toBeNull()
    expect(within(shellPart('rail')).queryByRole('link', { name: 'Sticker' })).toBeNull()
  })

  it('is not on Thêm, which still leads to Cài đặt', async () => {
    renderApp('/more')
    const others = within(await screen.findByRole('navigation', { name: 'Mục khác' }))

    expect(others.queryByRole('link', { name: 'Sticker' })).toBeNull()
    expect(others.getByRole('link', { name: 'Cài đặt' })).toHaveAttribute('href', '/settings')
  })

  it('takes the old address to /settings/stickers, inside Cài đặt, with Sticker current in its table of contents', async () => {
    stubViewport(1440)
    const { router } = renderApp('/stickers')

    expect(await screen.findAllByRole('heading', { level: 1, name: 'Sticker' })).not.toHaveLength(0)
    expect(router.state.location.pathname).toBe('/settings/stickers')
    const toc = within(screen.getByRole('navigation', { name: 'Mục cài đặt' }))
    expect(toc.getByRole('link', { name: 'Sticker' })).toHaveAttribute('aria-current', 'page')
    expect(toc.getByRole('link', { name: 'Bảo mật' })).toHaveAttribute('href', '/settings#bao-mat')
    expect(within(shellPart('sidebar')).getByRole('link', { name: 'Cài đặt' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps "Thêm" as the current tab, as on the other screens behind it', async () => {
    renderApp('/settings/stickers')

    expect(await within(shellPart('tabbar')).findByRole('link', { name: 'Thêm' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens from the "Sticker" item of the table of contents of Cài đặt', async () => {
    stubViewport(1440)
    const user = userEvent.setup()
    const { router } = renderApp('/settings')
    const toc = within(await screen.findByRole('navigation', { name: 'Mục cài đặt' }))

    const links = toc.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(links.indexOf('/settings/stickers')).toBe(links.indexOf('#nguon') + 1)
    await user.click(toc.getByRole('link', { name: 'Sticker' }))

    expect(router.state.location.pathname).toBe('/settings/stickers')
  })
})

describe('top bar', () => {
  // The sync line is now the latest sync of the accounts (useShellData); the first-sync progress has no source here.
  const syncedAt = (when: string | null) => {
    const accounts = accountsWithStatus('CONNECTED', 'CONNECTED')
    return { ...accounts, accounts: accounts.accounts.map((account, index) => ({ ...account, lastSyncedAt: index === 0 ? when : null })) }
  }

  it('shows when the last sync was, the latest of any account', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-02T07:00:00Z'))
      renderApp('/overview', { accounts: syncedAt('2026-10-02T06:58:00Z') })

      expect(await within(shellPart('topbar')).findAllByText('Đồng bộ 2 phút trước')).not.toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('measures the time since the last sync when it renders, not when the shell first appeared', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-02T07:00:00Z'))
      const { queryClient } = renderApp('/overview', { accounts: syncedAt(null) })
      await within(shellPart('topbar')).findAllByText('Chưa đồng bộ lần nào')

      vi.setSystemTime(new Date('2026-10-02T07:00:50Z'))
      act(() => queryClient.setQueryData(ACCOUNTS_QUERY_KEY, syncedAt('2026-10-02T06:58:50Z')))

      expect(await within(shellPart('topbar')).findAllByText('Đồng bộ 2 phút trước')).not.toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('says when no source is connected yet', async () => {
    renderApp('/overview', { accounts: accountsWithStatus() })

    expect(await within(shellPart('topbar')).findAllByText('Chưa có nguồn nào')).not.toHaveLength(0)
  })

  it('says that nothing has synced yet when accounts exist but none has synced', async () => {
    renderApp('/overview', { accounts: syncedAt(null) })

    expect(await within(shellPart('topbar')).findAllByText('Chưa đồng bộ lần nào')).not.toHaveLength(0)
  })

  it('has a bell with the unread of the mail and the chats, and offers the theme switch and the search', async () => {
    renderApp('/overview')
    const topbar = within(shellPart('topbar'))

    // The sample inbox has 7 unread mails and 5 unread chats.
    expect(await topbar.findAllByRole('button', { name: 'Thông báo, 12 mới' })).toHaveLength(2) // desktop bar and tablet bar
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
  })
})

describe('the counts of accounts (NS-01, NS-03, D-321, D-326)', () => {
  // The shell sample says 1; each test gives the list another number, so the two cannot agree by chance.
  it('takes it from the account list, not from the shell data (the sidebar has no Tài khoản link, the rail has)', async () => {
    renderApp('/overview', {
      accounts: accountsWithStatus('AUTH_EXPIRED', 'ERROR', 'CONNECTED'),
      shell: shellWith((s) => (s.navCounts.accountsNeedingAction = 7)),
    })

    expect(await within(shellPart('rail')).findByRole('link', { name: 'Tài khoản, 2 cần xử lý' })).toHaveAttribute('href', '/accounts')
  })

  it('shows nothing on Tài khoản when no account needs action, whatever the shell data says', async () => {
    renderApp('/overview', {
      accounts: accountsWithStatus('CONNECTED', 'DEGRADED', 'DISABLED'),
      shell: shellWith((s) => (s.navCounts.accountsNeedingAction = 1)),
    })

    expect(await within(shellPart('rail')).findByRole('link', { name: 'Tài khoản' })).toHaveAttribute('href', '/accounts')
  })

  it('shows nothing while the account list has not come, rather than the sample count', async () => {
    server.use(http.get('/api/accounts', () => delay('infinite')), http.get('/api/providers', () => delay('infinite')))
    renderApp('/overview', { accounts: null, shell: shellWith((s) => (s.navCounts.accountsNeedingAction = 1)) })

    expect(await within(shellPart('rail')).findByRole('link', { name: 'Tài khoản' })).toBeInTheDocument()
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
// The bell counts what is unread in the inbox, plus what has just arrived (NotificationsMenu); nothing else flags it.
describe('what has no source yet is not flagged (NS-02, D-325)', () => {
  it('rings no bell when nothing is unread: no number in its name', async () => {
    renderApp('/overview', { inbox: inboxWithUnread(0, 0) })
    const topbar = within(shellPart('topbar'))

    const bells = await topbar.findAllByRole('button', { name: 'Thông báo' })

    expect(bells).toHaveLength(2) // desktop bar and tablet bar
    for (const bell of bells) {
      expect(bell.querySelector('span')).toBeNull()
    }
    expect(topbar.queryByRole('button', { name: /mới/ })).not.toBeInTheDocument()
  })

  it('flags nothing about the registrations: there is no link to them in the sidebar', async () => {
    renderApp('/overview')

    await within(shellPart('sidebar')).findAllByText('An Nguyễn')
    expect(within(shellPart('sidebar')).queryByRole('link', { name: /Đăng ký/ })).not.toBeInTheDocument()
  })

  it('counts the unread of the mail and the chats on the bell', async () => {
    renderApp('/overview', { inbox: inboxWithUnread(3, 1) })

    expect(await within(shellPart('topbar')).findAllByRole('button', { name: 'Thông báo, 4 mới' })).toHaveLength(2)
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

// The new messages that came while the owner was elsewhere are told inside the bell now (NotificationsMenu, messages-by-account);
// there is no bar under the top bar any more.
describe('the notice of new messages (NF-02, D-318, D-319)', () => {
  const sample = createInboxSample(new Date())
  const ZALO = sample.accounts.find((account) => account.provider === 'zalo')!.id
  const sync = (accountId: string, newInbound: number) =>
    act(() => publishConversationsChanged({ accountId, conversationIds: ['c-1'], newInbound, source: 'sync', at: new Date().toISOString() }))

  it('tells a new chat in the menu of the bell, on a screen that is not the list of chats', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/conversations', () => HttpResponse.json({ items: [], nextCursor: null })))
    renderApp('/tasks', { inbox: inboxWithUnread(0, 0) })
    await screen.findByRole('main')

    sync(ZALO, 1)

    const bell = (await within(shellPart('topbar')).findAllByRole('button', { name: 'Thông báo, 1 mới' }))[0]
    await user.click(bell)
    const menu = within(await screen.findByRole('menu'))
    expect(await menu.findByText('1 tin mới')).toBeInTheDocument()
    expect(menu.getByRole('link', { name: 'Xem' })).toHaveAttribute('href', '/messages')
  })

  it('has no bar between the top bar and the page', async () => {
    renderApp('/tasks')
    await screen.findByRole('main')

    sync(ZALO, 1)

    expect(document.querySelector('[data-slot="notice-bar"]')).toBeNull()
  })

  it('lets the notice go when "Xem" is pressed', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/conversations', () => HttpResponse.json({ items: [], nextCursor: null })))
    const { router } = renderApp('/tasks', { inbox: inboxWithUnread(0, 0) })
    await screen.findByRole('main')
    sync(ZALO, 2)

    await user.click((await within(shellPart('topbar')).findAllByRole('button', { name: 'Thông báo, 2 mới' }))[0])
    await user.click(await within(await screen.findByRole('menu')).findByRole('link', { name: 'Xem' }))

    expect(router.state.location.pathname).toBe('/messages')
    // The menu stays open after the link (the rest of the page is hidden from the tree while it is), so close it.
    await user.keyboard('{Escape}')
    expect(await within(shellPart('topbar')).findAllByRole('button', { name: 'Thông báo' })).not.toHaveLength(0)
  })

  it('leaves the open list to its own notice', async () => {
    renderApp('/messages')
    await screen.findByRole('main')

    sync(ZALO, 1)

    // The list says "1 tin mới" itself (D-92).
    expect(await screen.findByRole('button', { name: '1 tin mới' })).toBeInTheDocument()
  })
})
