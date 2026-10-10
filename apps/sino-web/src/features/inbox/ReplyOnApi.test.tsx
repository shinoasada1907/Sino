import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_COUNTS, API_MESSAGES, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const TO = [{ name: 'Trần Minh Anh', address: 'minhanh@acme.vn' }]

/** The F05 + F06 API with the `reply` of F10 on the conversation (`undefined`: a backend before F10). */
function backend(reply: { state: string; to: typeof TO } | undefined, accountStatus = 'CONNECTED') {
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS.map((account) => (account.id === 'acc-1' ? { ...account, status: accountStatus } : account)))),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/conversations/counts', () => HttpResponse.json(API_COUNTS)),
    http.get('/api/conversations', () => HttpResponse.json({ items: API_CONVERSATIONS, nextCursor: null })),
    http.get('/api/conversations/:id', ({ params }) =>
      HttpResponse.json({ ...API_CONVERSATIONS.find((entry) => entry.id === params.id), participants: API_PARTICIPANTS, ...(reply ? { reply } : {}) }),
    ),
    http.patch('/api/conversations/:id', ({ params }) => HttpResponse.json({ ...API_CONVERSATIONS.find((entry) => entry.id === params.id), unreadCount: 0 })),
    http.get('/api/conversations/:id/messages', () => HttpResponse.json({ items: API_MESSAGES, nextCursor: null })),
  )
}

const open = () => renderApp('/inbox/c-1', { inbox: null })
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
const settled = () => thread().findByText(/^Chào An, mình gửi bản hợp đồng/)

describe('replying on the F10 API: the reply state and who it goes to (FE-61)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers the reply box when Sino can send, and says who the reply goes to', async () => {
    backend({ state: 'READY', to: TO })
    open()

    expect(await thread().findByRole('textbox', { name: 'Trả lời Trần Minh Anh' })).toBeInTheDocument()
    expect(thread().getByText('Trần Minh Anh <minhanh@acme.vn>').parentElement).toHaveTextContent(/^Tới Trần Minh Anh <minhanh@acme.vn>$/)
  })

  it('asks to grant sending, through the reconnect flow, for an account connected before Sino could send', async () => {
    backend({ state: 'NEEDS_PERMISSION', to: TO })
    open()

    const notice = (await thread().findByText('Sino chưa có quyền gửi thư từ an.nguyen@gmail.com')).closest('[role="status"]') as HTMLElement
    expect(notice).toHaveTextContent('Bạn vẫn đọc thư bình thường. Cấp thêm quyền gửi để trả lời từ Sino.')
    expect(within(notice).getByRole('link', { name: 'Cấp quyền gửi' })).toHaveAttribute('href', '/accounts?reconnect=acc-1')
    expect(thread().queryByRole('textbox')).toBeNull()
  })

  it('sends the reader to the provider when it cannot send from Sino', async () => {
    backend({ state: 'NOT_SUPPORTED', to: [] })
    open()
    await settled()

    const notice = (await thread().findByText('Gmail chưa cho Sino gửi thư')).closest('[role="status"]') as HTMLElement
    expect(notice).toHaveTextContent('Bạn trả lời trong Gmail.')
    expect(within(notice).queryByRole('button')).toBeNull()
    expect(within(notice).queryByRole('link')).toBeNull()
  })

  it('says the same on a backend that does not tell yet', async () => {
    backend(undefined)
    open()
    await settled()

    expect(await thread().findByText('Gmail chưa cho Sino gửi thư')).toBeInTheDocument()
    expect(thread().queryByRole('textbox')).toBeNull()
  })

  it('asks to sign in again when the account lost its access', async () => {
    backend({ state: 'ACCOUNT_UNAVAILABLE', to: TO }, 'AUTH_EXPIRED')
    open()

    const alert = await thread().findByRole('alert')
    expect(alert).toHaveTextContent('Cần đăng nhập lại Gmail để nhận và gửi tin')
    expect(within(alert).getByRole('link', { name: 'Kết nối lại' })).toHaveAttribute('href', '/accounts?reconnect=acc-1')
  })
})
