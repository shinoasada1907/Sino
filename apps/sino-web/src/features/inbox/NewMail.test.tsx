import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import { createInboxSample, type InboxSample } from './inbox.sample'
import type { InboxAccount } from './inbox.types'

// The screen on the full contract (sample data); the API path of sending is tested in NewMailOnApi.test.tsx.
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')
const REMEMBERED = 'sino.newMail.from'

function open(path: string, change: (inbox: InboxSample) => void = () => {}) {
  const inbox = createInboxSample(NOW)
  change(inbox)
  return renderApp(path, { shell: createShellSample(NOW), inbox })
}

const gmail = (inbox: InboxSample): InboxAccount => inbox.accounts.find((account) => account.provider === 'gmail')!
const form = () => within(screen.getByRole('form', { name: 'Thư mới' }))
const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))

describe('Tạo thư mới: the page and its form (FE-83, f10-new-mail)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('offers "Thư mới" at the top of the list at every width, and opens /inbox/new in the reading column (D-191)', async () => {
    const user = userEvent.setup()
    const { router } = open('/inbox?view=unread')

    // The header of 1280px, the row of chips of a tablet, the header of a phone (above the list region).
    const links = await screen.findAllByRole('link', { name: 'Thư mới' })
    expect(links).toHaveLength(3)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/inbox/new?view=unread'))

    await user.click(links[0])

    expect(router.state.location.pathname).toBe('/inbox/new')
    expect(await screen.findByRole('form', { name: 'Thư mới' })).toBeInTheDocument()
    for (const field of ['Tới', 'Tiêu đề', 'Nội dung']) {
      expect(form().getByLabelText(field)).toBeInTheDocument()
    }
    expect(form().getByRole('button', { name: 'Gửi' })).toBeInTheDocument()
    expect(form().getByRole('button', { name: 'Bỏ' })).toBeInTheDocument()
  })

  it('sends from the only account that can, with nothing to choose (D-193)', async () => {
    open('/inbox/new')

    expect(await form().findByText('an.nguyen@gmail.com')).toBeInTheDocument()
    expect(form().queryByRole('combobox', { name: 'Từ' })).toBeNull()
  })

  it('lists every account, keeps the ones that cannot send out of reach with the reason, and starts from the one used last', async () => {
    localStorage.setItem(REMEMBERED, 'acc-work')
    open('/inbox/new', (inbox) => {
      inbox.accounts.push(
        { ...gmail(inbox), id: 'acc-work', externalAccountId: 'an@congty.vn', address: 'an@congty.vn' },
        { ...gmail(inbox), id: 'acc-old', externalAccountId: 'an.cu@gmail.com', address: 'an.cu@gmail.com', sending: 'NEEDS_PERMISSION' },
      )
    })

    const from = await form().findByRole('combobox', { name: 'Từ' })
    expect(from).toHaveValue('acc-work')
    expect(within(from).getByRole('option', { name: 'an.nguyen@gmail.com' })).toBeEnabled()
    expect(within(from).getByRole('option', { name: 'an.cu@gmail.com · Cần cấp quyền gửi' })).toBeDisabled()
    // Chats cannot start a mail.
    expect(within(from).queryByRole('option', { name: /\+84/ })).toBeNull()
  })

  it('says so when no account can send, with "Cấp quyền gửi" (D-193)', async () => {
    open('/inbox/new', (inbox) => {
      gmail(inbox).sending = 'NEEDS_PERMISSION'
    })

    expect(await screen.findByText('Sino chưa có quyền gửi thư từ tài khoản nào')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cấp quyền gửi' })).toHaveAttribute('href', '/accounts?reconnect=acc-gmail')
    expect(screen.queryByRole('form', { name: 'Thư mới' })).toBeNull()
  })

  it('names the invalid addresses and what is missing, and sends nothing (D-197)', async () => {
    const user = userEvent.setup()
    open('/inbox/new')

    await user.click(await form().findByRole('button', { name: 'Gửi' }))
    expect(form().getByText('Nhập ít nhất một người nhận')).toBeInTheDocument()
    expect(form().getByText('Nhập nội dung thư')).toBeInTheDocument()
    expect(form().getByLabelText('Tới')).toHaveAttribute('aria-invalid', 'true')

    await user.type(form().getByLabelText('Tới'), 'minhanh@acme.vn, an@')
    await user.click(form().getByRole('button', { name: 'Gửi' }))
    expect(form().getByText('Địa chỉ không hợp lệ: an@')).toBeInTheDocument()

    await user.clear(form().getByLabelText('Tới'))
    await user.click(form().getByLabelText('Tới'))
    await user.paste(Array.from({ length: 51 }, (_, index) => `n${index}@acme.vn`).join(', '))
    await user.click(form().getByRole('button', { name: 'Gửi' }))
    expect(form().getByText('Tối đa 50 người nhận')).toBeInTheDocument()
  })

  it('asks before leaving a mail with text, and keeps it on "Tiếp tục soạn" (D-191)', async () => {
    const user = userEvent.setup()
    const { router } = open('/inbox/new')

    await user.type(await form().findByLabelText('Nội dung'), 'Chào chị')
    await user.click(list().getByRole('link', { name: /Trần Minh Anh/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Bỏ thư đang soạn?' })
    await user.click(within(dialog).getByRole('button', { name: 'Tiếp tục soạn' }))
    expect(router.state.location.pathname).toBe('/inbox/new')
    expect(form().getByLabelText('Nội dung')).toHaveValue('Chào chị')

    await user.click(form().getByRole('button', { name: 'Bỏ' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Bỏ thư đang soạn?' })).getByRole('button', { name: 'Bỏ thư' }))
    expect(router.state.location.pathname).toBe('/inbox')
  })

  it('leaves an empty mail at once', async () => {
    const user = userEvent.setup()
    const { router } = open('/inbox/new')

    await user.click(await list().findByRole('link', { name: /Trần Minh Anh/ }))

    expect(router.state.location.pathname).toBe('/inbox/conv-1')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
