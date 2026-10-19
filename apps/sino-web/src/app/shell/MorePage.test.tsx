import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { accountsWithStatus } from '@/test/accountsWithStatus'
import { renderApp } from '@/test/renderApp'
import { createShellSample } from './shell.sample'

// The shell sample says 1 account needs action; each test gives the account list another number, so the two cannot agree by chance.
function shellSayingOne() {
  const shell = createShellSample(new Date())
  shell.navCounts.accountsNeedingAction = 1
  return shell
}

describe('"Thêm" page: accounts needing action (NS-01, D-321, D-322)', () => {
  it('counts them from the account list, in the owner card and on the Tài khoản row', async () => {
    renderApp('/more', { accounts: accountsWithStatus('AUTH_EXPIRED', 'ERROR', 'CONNECTED'), shell: shellSayingOne() })

    expect(await screen.findByText(/· 2 cần xử lý$/)).toBeInTheDocument()
    const others = within(screen.getByRole('navigation', { name: 'Mục khác' }))
    expect(others.getByRole('link', { name: /Tài khoản/ })).toHaveAccessibleName('Tài khoản, 2 cần xử lý')
  })

  it('says nothing about action when no account needs it, whatever the shell data says', async () => {
    renderApp('/more', { accounts: accountsWithStatus('CONNECTED', 'DEGRADED'), shell: shellSayingOne() })

    expect(await screen.findByRole('heading', { level: 1, name: 'Thêm' })).toBeInTheDocument()
    expect(screen.queryByText(/cần xử lý/)).not.toBeInTheDocument()
    const others = within(screen.getByRole('navigation', { name: 'Mục khác' }))
    expect(others.getByRole('link', { name: /Tài khoản/ })).toHaveAccessibleName('Tài khoản')
  })
})
