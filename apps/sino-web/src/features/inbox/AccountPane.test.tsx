import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import { createInboxSample } from './inbox.sample'

vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')

const open = (path: string, change?: (inbox: ReturnType<typeof createInboxSample>) => void) => {
  const inbox = createInboxSample(NOW)
  change?.(inbox)
  return renderApp(path, { shell: createShellSample(NOW), inbox })
}
const column = async () => within(await screen.findByRole('navigation', { name: 'Tài khoản' }))

describe('the account column (MA-05, D-429)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists "Tất cả" and the accounts under their provider, with the unread of each', async () => {
    open('/messages')
    const pane = await column()

    expect(pane.getByRole('link', { name: /^Tất cả/ })).toHaveAttribute('aria-current', 'page')
    expect(pane.getByRole('link', { name: /^Tất cả/ })).toHaveTextContent('5')
    expect(pane.getByText('Zalo')).toBeInTheDocument()
    expect(pane.getByRole('link', { name: /\+84 9•• ••• 218/ })).toHaveTextContent('4')
    expect(pane.getByRole('link', { name: 'Thêm nguồn' })).toHaveAttribute('href', '/accounts?connect=new')
    // The accounts of the other screen are not here
    expect(pane.queryByText(/gmail/)).toBeNull()
    expect(pane.queryByRole('link', { name: 'Xem tài khoản' })).toBeNull()
  })

  it('filters by the account clicked, marks it, and offers "Xem tài khoản"', async () => {
    const { router } = open('/messages')
    const pane = await column()

    await userEvent.setup().click(pane.getByRole('link', { name: /\+84 9•• ••• 218/ }))

    expect(router.state.location.search).toMatch(/account=/)
    const after = await column()
    expect(after.getByRole('link', { name: /\+84 9•• ••• 218/ })).toHaveAttribute('aria-current', 'page')
    expect(after.getByRole('link', { name: /^Tất cả/ })).not.toHaveAttribute('aria-current')
    expect(after.getByRole('link', { name: 'Xem tài khoản' })).toHaveAttribute('href', expect.stringMatching(/^\/accounts\/./))
  })

  it('shows a red dot and the words "cần đăng nhập lại" instead of a count for an expired account', async () => {
    open('/messages', (inbox) => {
      inbox.accounts = inbox.accounts.map((account) => (account.address === 'an.nguyen.92' ? { ...account, status: 'AUTH_EXPIRED' } : account))
    })
    const pane = await column()

    const expired = pane.getByRole('link', { name: /an\.nguyen\.92/ })
    expect(within(expired).getByText('cần đăng nhập lại')).toBeInTheDocument()
    expect(within(expired).queryByText(/^\d+$/)).toBeNull()
  })

  it('is on Hộp thư too, with the Gmail accounts', async () => {
    open('/inbox')
    const pane = await column()

    expect(pane.getByText('Gmail')).toBeInTheDocument()
    expect(pane.getByRole('link', { name: /an\.nguyen@gmail\.com/ })).toHaveTextContent('7')
  })

  it('leaves the open chat to the strip of MA-06: no column while a chat is open', async () => {
    open('/messages/conv-4')
    await screen.findByRole('region', { name: /Cuộc trò chuyện /, hidden: true })

    expect(screen.queryByRole('navigation', { name: 'Tài khoản' })).toBeNull()
  })
})
