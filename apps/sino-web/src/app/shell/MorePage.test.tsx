import { screen, within } from '@testing-library/react'
import { delay, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { accountsWithStatus } from '@/test/accountsWithStatus'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import { createShellSample } from './shell.sample'

// The shell sample says 1 account needs action; each test gives the account list another number, so the two cannot agree by chance.
function shellSayingOne() {
  const shell = createShellSample(new Date())
  shell.navCounts.accountsNeedingAction = 1
  return shell
}

describe('"Thêm" page: the counts of accounts (NS-01, NS-03, D-321, D-326)', () => {
  it('counts them from the account list, in the owner card and on the Tài khoản row', async () => {
    renderApp('/more', { accounts: accountsWithStatus('AUTH_EXPIRED', 'ERROR', 'CONNECTED'), shell: shellSayingOne() })

    expect(await screen.findByText(/· 2 cần xử lý$/)).toBeInTheDocument()
    const others = within(screen.getByRole('navigation', { name: 'Mục khác' }))
    expect(others.getByRole('link', { name: /Tài khoản/ })).toHaveAccessibleName('Tài khoản, 2 cần xử lý')
  })

  it('says how many accounts the list has, not the shell data', async () => {
    const shell = shellSayingOne()
    shell.accountCount = 9
    renderApp('/more', { accounts: accountsWithStatus('AUTH_EXPIRED', 'ERROR', 'CONNECTED'), shell })

    expect(await screen.findByText('3 tài khoản · 2 cần xử lý')).toBeInTheDocument()
  })

  it('says nothing of the accounts while the list has not come', async () => {
    server.use(http.get('/api/accounts', () => delay('infinite')), http.get('/api/providers', () => delay('infinite')))
    renderApp('/more', { accounts: null, shell: shellSayingOne() })

    expect(await screen.findByRole('heading', { level: 1, name: 'Thêm' })).toBeInTheDocument()
    expect(screen.queryByText(/^\d+ tài khoản/)).not.toBeInTheDocument()
  })

  it('says nothing about action when no account needs it, whatever the shell data says', async () => {
    renderApp('/more', { accounts: accountsWithStatus('CONNECTED', 'DEGRADED'), shell: shellSayingOne() })

    expect(await screen.findByRole('heading', { level: 1, name: 'Thêm' })).toBeInTheDocument()
    expect(screen.queryByText(/cần xử lý/)).not.toBeInTheDocument()
    const others = within(screen.getByRole('navigation', { name: 'Mục khác' }))
    expect(others.getByRole('link', { name: /Tài khoản/ })).toHaveAccessibleName('Tài khoản')
  })
})

describe('"Thêm" page: what has no source yet is not flagged (NS-02, D-325)', () => {
  it('has no count on the Thông báo and Đăng ký rows', async () => {
    renderApp('/more')

    const others = within(await screen.findByRole('navigation', { name: 'Mục khác' }))
    expect(others.getByRole('link', { name: 'Thông báo' })).toHaveAccessibleName('Thông báo')
    expect(others.getByRole('link', { name: 'Đăng ký' })).toHaveAccessibleName('Đăng ký')
    expect(others.queryByText(/mới/)).not.toBeInTheDocument()
  })

  // The shell data no longer carries a count of notifications (useShellData: derived from the owner and the accounts), so the
  // row stays plain whatever the inbox holds; the bell of the top bar counts the unread itself.
  it('keeps the Thông báo row plain even while there is unread mail', async () => {
    renderApp('/more')

    const others = within(await screen.findByRole('navigation', { name: 'Mục khác' }))
    expect(others.getByRole('link', { name: /^Thông báo/ })).toHaveAccessibleName('Thông báo')
  })
})
