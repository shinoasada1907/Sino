import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_COUNTS, API_MESSAGES, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

const NEW_ITEM = { ...API_CONVERSATIONS[1], id: 'c-new', title: 'minhanh@acme.vn', subject: 'Báo giá', snippet: 'Chào chị', accountIds: ['acc-1'] }
const ownMail = (status: string, clientMessageId: string) => ({
  ...API_MESSAGES[1],
  id: 'm-new',
  status,
  to: [{ name: null, address: 'minhanh@acme.vn' }],
  subject: 'Báo giá',
  text: 'Chào chị',
  clientMessageId,
})

type Posted = { accountId: string; to: string[]; subject: string; text: string; clientMessageId: string }

/**
 * The inbox API with `POST /api/conversations` of f10-new-mail: `acc-1` can send, `acc-2` must sign in again. `create`
 * answers each send; the new conversation `c-new` then opens with `opening` replies until its mail went.
 */
function backend(create: (body: Posted) => Response, { opening = false }: { opening?: boolean } = {}) {
  const posted: Posted[] = []
  const deleted: string[] = []
  let accountReads = 0
  server.use(
    http.get('/api/accounts', () => {
      accountReads += 1
      return HttpResponse.json(API_ACCOUNTS.map((account, index) => (index === 0 ? { ...account, capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'] } : account)))
    }),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/conversations/counts', () => HttpResponse.json(API_COUNTS)),
    http.get('/api/conversations', () => HttpResponse.json({ items: API_CONVERSATIONS, nextCursor: null })),
    http.post('/api/conversations', async ({ request }) => {
      const body = (await request.json()) as Posted
      posted.push(body)
      return create(body)
    }),
    http.get('/api/conversations/:id', ({ params }) => {
      const item = params.id === 'c-new' ? NEW_ITEM : API_CONVERSATIONS.find((entry) => entry.id === params.id)
      const reply = { state: opening ? 'OPENING_NOT_SENT' : 'READY', to: [{ name: null, address: 'minhanh@acme.vn' }] }
      return HttpResponse.json({ ...item, participants: API_PARTICIPANTS, reply })
    }),
    http.get('/api/conversations/:id/messages', ({ params }) =>
      HttpResponse.json({ items: params.id === 'c-new' ? [ownMail(opening ? 'FAILED' : 'SENT', 'cid-1')] : API_MESSAGES, nextCursor: null }),
    ),
    http.delete('/api/conversations/:id/messages/:messageId', ({ params }) => {
      deleted.push(`${params.id}/${params.messageId}`)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return { posted, deleted, accountReads: () => accountReads }
}

const created = (body: Posted) => HttpResponse.json({ conversation: NEW_ITEM, message: ownMail('SENT', body.clientMessageId) }, { status: 201 })
const form = () => within(screen.getByRole('form', { name: 'Thư mới' }))

async function write(user: ReturnType<typeof userEvent.setup>) {
  const mail = within(await screen.findByRole('form', { name: 'Thư mới' }))
  await user.type(mail.getByLabelText('Tới'), 'minhanh@acme.vn')
  await user.type(mail.getByLabelText('Tiêu đề'), 'Báo giá')
  await user.type(mail.getByLabelText('Nội dung'), 'Chào chị')
  await user.click(mail.getByRole('button', { name: 'Gửi' }))
}

const open = (path: string) => renderApp(path, { inbox: null })

describe('sending a new mail on the API (FE-84, f10-new-mail)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('sends the mail and opens its new conversation in place of the form, without asking to drop it (D-194)', async () => {
    const user = userEvent.setup()
    const { posted } = backend(created)
    const { router } = open('/inbox/new?view=unread')

    await write(user)

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/inbox/c-new'))
    expect(router.state.location.search).toBe('?view=unread')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posted).toEqual([{ accountId: 'acc-1', to: ['minhanh@acme.vn'], subject: 'Báo giá', text: 'Chào chị', clientMessageId: expect.stringMatching(/^[0-9a-f-]{36}$/) }])
    // The next new mail starts from this account.
    expect(localStorage.getItem('sino.newMail.from')).toBe('acc-1')
  })

  it.each([
    [502, 'SEND_FAILED'],
    [504, 'SEND_OUTCOME_UNKNOWN'],
  ])('opens the new conversation when Gmail refused the mail or did not answer about it (%i)', async (status, code) => {
    const user = userEvent.setup()
    backend(() => problem({ status, code, conversationId: 'c-new', messageId: 'm-new' }, status))
    const { router } = open('/inbox/new')

    await write(user)

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/inbox/c-new'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the mail, locked, when no answer came, and sends it again with the same ID (D-194)', async () => {
    const user = userEvent.setup()
    let calls = 0
    const { posted } = backend((body) => (++calls === 1 ? HttpResponse.error() : created(body)))
    const { router } = open('/inbox/new')

    await write(user)

    expect(await form().findByText('Mất kết nối khi gửi. Gửi lại không làm thư bị gửi hai lần.')).toBeInTheDocument()
    expect(form().getByLabelText('Nội dung')).toHaveValue('Chào chị')
    expect(form().getByLabelText('Nội dung')).toBeDisabled()
    expect(form().getByLabelText('Tới')).toBeDisabled()

    await user.click(form().getByRole('button', { name: 'Gửi lại' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/inbox/c-new'))
    expect(posted).toHaveLength(2)
    expect(posted[1]).toEqual(posted[0])
  })

  it('shows the field errors of the server under their fields, and the mail stays editable', async () => {
    const user = userEvent.setup()
    backend(() => problem({ status: 400, code: 'VALIDATION_FAILED', errors: [{ field: 'to[0]', message: 'must be an address' }] }, 400))
    open('/inbox/new')

    await write(user)

    expect(await form().findByText('Người nhận không hợp lệ')).toBeInTheDocument()
    expect(form().getByLabelText('Tới')).toHaveAttribute('aria-invalid', 'true')
    expect(form().getByLabelText('Tới')).toBeEnabled()
  })

  it('says when the account can no longer send, and reads the accounts again (409 SEND_NOT_ALLOWED)', async () => {
    const user = userEvent.setup()
    const backendState = backend(() => problem({ status: 409, code: 'SEND_NOT_ALLOWED', state: 'NEEDS_PERMISSION' }, 409))
    open('/inbox/new')

    await write(user)

    expect(await form().findByText('Tài khoản này không gửi được thư nữa')).toBeInTheDocument()
    await vi.waitFor(() => expect(backendState.accountReads()).toBeGreaterThan(1))
  })

  it('keeps the mail when the backend cannot start one yet (404 without ACCOUNT_NOT_FOUND)', async () => {
    const user = userEvent.setup()
    backend(() => problem({ status: 404, code: 'RESOURCE_NOT_FOUND' }, 404))
    open('/inbox/new')

    await write(user)

    expect(await form().findByText('Sino chưa gửi được thư mới. Bạn gửi trong Gmail.')).toBeInTheDocument()
    expect(form().getByLabelText('Nội dung')).toBeEnabled()
  })

  it('opens a new conversation whose opening mail did not go without a reply box, and "Bỏ" goes back to the list (D-195)', async () => {
    const user = userEvent.setup()
    const { deleted } = backend(created, { opening: true })
    const { router } = open('/inbox/c-new?view=unread')

    const thread = within(await screen.findByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
    // "<time> · Không gửi được" beside the mail.
    expect(await thread.findByText(/· Không gửi được$/)).toBeInTheDocument()
    expect(thread.getByRole('button', { name: 'Gửi lại' })).toBeInTheDocument()
    expect(thread.queryByRole('textbox', { name: /Trả lời/ })).toBeNull()
    expect(thread.queryByRole('status')).toBeNull()

    await user.click(thread.getByRole('button', { name: 'Bỏ' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/inbox'))
    expect(router.state.location.search).toBe('?view=unread')
    expect(deleted).toEqual(['c-new/m-new'])
  })
})
