import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS, apiInitialSync } from '@/test/fixtures/accountsApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import { leaveTo } from './accounts.api'

// Leaving Sino cannot happen in jsdom; the test checks where the browser would go.
vi.mock('./accounts.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./accounts.api')>()
  return { ...api, leaveTo: vi.fn() }
})

const GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth?state=s1'
const wizard = () => within(screen.getByRole('dialog'))
/** The wizard opens once the account list has arrived (it checks the ids of the address against it). */
const opened = async () => within(await screen.findByRole('dialog'))

function backend({ providers = API_PROVIDERS, connect = true }: { providers?: typeof API_PROVIDERS; connect?: boolean } = {}) {
  const sent: unknown[] = []
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(providers)),
    http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(apiInitialSync())),
    http.post('/api/accounts/connect/:provider', async ({ params, request }) => {
      const text = await request.text()
      sent.push([params.provider, text === '' ? null : JSON.parse(text)])
      return connect
        ? HttpResponse.json({ authorizationUrl: GOOGLE })
        : HttpResponse.json({ title: 'Not found', status: 404, code: 'PROVIDER_NOT_FOUND' }, { status: 404, headers: { 'Content-Type': 'application/problem+json' } })
    }),
  )
  return sent
}

describe('connecting an account on the backend API (FE-30)', () => {
  it('starts a Gmail connect and leaves for the address the backend gives', async () => {
    const sent = backend()
    renderApp('/accounts?connect=new', { accounts: null })
    const user = userEvent.setup()

    expect(await (await opened()).findByRole('radio', { name: /Gmail/ })).toBeChecked()
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    expect(wizard().getByText('Trang của Google liệt kê từng quyền Sino xin; bạn xem và đồng ý ở đó.')).toBeInTheDocument()
    await user.click(wizard().getByRole('button', { name: 'Đồng ý và tiếp tục' }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục tới Google' }))

    await vi.waitFor(() => expect(leaveTo).toHaveBeenCalledWith(GOOGLE))
    expect(sent).toEqual([['gmail', null]])
  })

  it('signs an expired account in again', async () => {
    const sent = backend()
    renderApp('/accounts?reconnect=acc-2', { accounts: null })
    const user = userEvent.setup()

    await user.click((await opened()).getByRole('button', { name: 'Đồng ý và tiếp tục' }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục tới Google' }))

    await vi.waitFor(() => expect(leaveTo).toHaveBeenCalledWith(GOOGLE))
    expect(sent).toEqual([['gmail', { accountId: 'acc-2' }]])
  })

  it('says so when the backend refuses to start', async () => {
    backend({ connect: false })
    renderApp('/accounts?connect=new', { accounts: null })
    const user = userEvent.setup()

    await (await opened()).findByRole('radio', { name: /Gmail/ })
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    await user.click(wizard().getByRole('button', { name: 'Đồng ý và tiếp tục' }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục tới Google' }))

    expect(await wizard().findByRole('alert')).toHaveTextContent('Không bắt đầu được kết nối. Hãy thử lại.')
    expect(leaveTo).not.toHaveBeenCalled()
  })

  it('says when the server has no provider to connect, and does not go on', async () => {
    backend({ providers: [] })
    renderApp('/accounts?connect=new', { accounts: null })

    expect(await (await opened()).findByText('Máy chủ Sino chưa bật nhà cung cấp nào để kết nối.')).toBeInTheDocument()
    expect(wizard().getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  })
})

const ZALO_ON = { type: 'zalo', displayName: 'Zalo', kind: 'CHAT', capabilities: ['READ_MESSAGES'], connectMethod: 'QR' as const, connectable: true }
const ZALO_OFF = { ...ZALO_ON, connectable: false }
const EXPIRED_ZALO_ACCOUNT = {
  ...API_ACCOUNTS[1],
  id: 'acc-zalo-exp',
  provider: 'zalo',
  externalAccountId: '100000000000000001',
  displayName: 'An Zalo',
  address: 'An Zalo',
  status: 'AUTH_EXPIRED' as const,
}

function qrBackend({
  providers = [...API_PROVIDERS, ZALO_ON],
  accounts = API_ACCOUNTS,
  states = [{ state: 'WAITING' }],
}: {
  providers?: object[]
  accounts?: typeof API_ACCOUNTS
  states?: object[]
} = {}) {
  let currentAccounts = [...accounts]
  const qrStarts: unknown[] = []
  const qrCancels: string[] = []
  const initialSyncs: unknown[] = []
  let pollIndex = 0
  let loginSeq = 0

  server.use(
    http.get('/api/accounts', () => HttpResponse.json(currentAccounts)),
    http.get('/api/providers', () => HttpResponse.json(providers)),
    http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(apiInitialSync())),
    http.post('/api/accounts/:id/initial-sync', async ({ params, request }) => {
      initialSyncs.push([params.id, await request.json()])
      return HttpResponse.json(apiInitialSync({ range: 'ALL', imported: 0, estimated: null, storedMessages: 0 }), { status: 202 })
    }),
    http.post('/api/accounts/connect/:provider/qr', async ({ params, request }) => {
      qrStarts.push([params.provider, await request.json()])
      loginSeq += 1
      return HttpResponse.json(
        { loginId: `login-${loginSeq}`, qrImage: 'iVBORw0KGgo=', expiresAt: '2026-10-02T07:06:40Z' },
        { status: 201 },
      )
    }),
    http.get('/api/accounts/connect/:provider/qr/:loginId', () => {
      const answer = states[Math.min(pollIndex, states.length - 1)] as {
        state: string
        accountId?: string
        reconnected?: boolean
        displayName?: string
      }
      pollIndex += 1
      if (answer.state === 'DONE' && answer.accountId) {
        if (answer.reconnected) {
          currentAccounts = currentAccounts.map((acc) => (acc.id === answer.accountId ? { ...acc, status: 'CONNECTED' } : acc))
        } else if (!currentAccounts.some((acc) => acc.id === answer.accountId)) {
          currentAccounts = [
            ...currentAccounts,
            {
              ...API_ACCOUNTS[0],
              id: answer.accountId,
              provider: 'zalo',
              externalAccountId: '100000000000000001',
              displayName: answer.displayName ?? 'An Zalo',
              address: answer.displayName ?? 'An Zalo',
              status: 'CONNECTED',
            },
          ]
        }
      }
      return HttpResponse.json(answer)
    }),
    http.delete('/api/accounts/connect/:provider/qr/:loginId', ({ params }) => {
      qrCancels.push(`${params.provider}/${params.loginId}`)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return { qrStarts, qrCancels, initialSyncs, getPolls: () => pollIndex }
}

describe('connecting a Zalo account by QR code (ZL-11)', () => {
  it('shows Zalo as "Sắp có" when turned off', async () => {
    qrBackend({ providers: [...API_PROVIDERS, ZALO_OFF] })
    renderApp('/accounts?connect=new', { accounts: null })

    const zaloRadio = await (await opened()).findByRole('radio', { name: /Zalo/ })
    expect(zaloRadio).toBeDisabled()
    expect(zaloRadio.closest('label')).toHaveTextContent('Sắp có')
  })

  it('locks "Hiện mã QR" and sends no request until the risk is accepted', async () => {
    const { qrStarts } = qrBackend()
    renderApp('/accounts?connect=new', { accounts: null })
    const user = userEvent.setup()

    await user.click(await (await opened()).findByRole('radio', { name: /Zalo/ }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))

    expect(wizard().getByText(/Sino kết nối Zalo bằng cách không chính thức\./)).toBeInTheDocument()
    const showQrButton = wizard().getByRole('button', { name: 'Hiện mã QR' })
    expect(showQrButton).toBeDisabled()
    expect(qrStarts).toHaveLength(0)

    await user.click(wizard().getByRole('checkbox', { name: 'Tôi hiểu rủi ro' }))
    expect(showQrButton).toBeEnabled()
  })

  it('connects a new Zalo account: WAITING -> SCANNED -> DONE starts initial-sync with range ALL and finishes with Mở Tin nhắn', async () => {
    const { qrStarts, initialSyncs } = qrBackend({
      states: [
        { state: 'SCANNED', displayName: 'Nguyễn Văn A' },
        { state: 'DONE', accountId: 'acc-zalo-new', reconnected: false },
      ],
    })
    renderApp('/accounts?connect=new', { accounts: null })
    const user = userEvent.setup()

    await user.click(await (await opened()).findByRole('radio', { name: /Zalo/ }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    await user.click(wizard().getByRole('checkbox', { name: 'Tôi hiểu rủi ro' }))
    await user.click(wizard().getByRole('button', { name: 'Hiện mã QR' }))

    expect(await wizard().findByRole('img', { name: 'Mã QR đăng nhập Zalo' })).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=')
    expect(await wizard().findByText('Đã quét: Nguyễn Văn A, xác nhận trên điện thoại')).toBeInTheDocument()
    expect(qrStarts).toEqual([['zalo', { acceptRisk: true }]])

    expect(await wizard().findByText(/Sino nhận tin Zalo từ bây giờ/, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(wizard().getByRole('link', { name: 'Mở Tin nhắn' })).toHaveAttribute('href', '/messages')
    expect(initialSyncs).toEqual([['acc-zalo-new', { range: 'ALL' }]])
  })

  it('replaces an expired QR code with "Mã đã hết hạn" and "Tạo mã mới", and requests a new code when clicked', async () => {
    const { qrStarts } = qrBackend({
      states: [{ state: 'EXPIRED' }, { state: 'WAITING' }],
    })
    renderApp('/accounts?connect=new', { accounts: null })
    const user = userEvent.setup()

    await user.click(await (await opened()).findByRole('radio', { name: /Zalo/ }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    await user.click(wizard().getByRole('checkbox', { name: 'Tôi hiểu rủi ro' }))
    await user.click(wizard().getByRole('button', { name: 'Hiện mã QR' }))

    expect(await wizard().findByText('Mã đã hết hạn')).toBeInTheDocument()
    expect(wizard().queryByRole('img', { name: 'Mã QR đăng nhập Zalo' })).toBeNull()

    await user.click(wizard().getByRole('button', { name: 'Tạo mã mới' }))
    expect(await wizard().findByRole('img', { name: 'Mã QR đăng nhập Zalo' })).toBeInTheDocument()
    expect(qrStarts).toHaveLength(2)
  })

  it('shows "Bạn đã từ chối trên điện thoại" and "Thử lại" when declined', async () => {
    const { qrStarts } = qrBackend({
      states: [{ state: 'DECLINED' }, { state: 'WAITING' }],
    })
    renderApp('/accounts?connect=new', { accounts: null })
    const user = userEvent.setup()

    await user.click(await (await opened()).findByRole('radio', { name: /Zalo/ }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    await user.click(wizard().getByRole('checkbox', { name: 'Tôi hiểu rủi ro' }))
    await user.click(wizard().getByRole('button', { name: 'Hiện mã QR' }))

    expect(await wizard().findByText('Bạn đã từ chối trên điện thoại')).toBeInTheDocument()
    await user.click(wizard().getByRole('button', { name: 'Thử lại' }))
    expect(await wizard().findByRole('img', { name: 'Mã QR đăng nhập Zalo' })).toBeInTheDocument()
    expect(qrStarts).toHaveLength(2)
  })

  it('stops polling and explains CONNECT_ACCOUNT_IN_USE without starting initial-sync', async () => {
    const { initialSyncs } = qrBackend({
      states: [{ state: 'FAILED', code: 'CONNECT_ACCOUNT_IN_USE' }],
    })
    renderApp('/accounts?connect=new', { accounts: null })
    const user = userEvent.setup()

    await user.click(await (await opened()).findByRole('radio', { name: /Zalo/ }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    await user.click(wizard().getByRole('checkbox', { name: 'Tôi hiểu rủi ro' }))
    await user.click(wizard().getByRole('button', { name: 'Hiện mã QR' }))

    expect(await wizard().findByText('Tài khoản Zalo này đã được kết nối với một tài khoản Sino khác.')).toBeInTheDocument()
    expect(initialSyncs).toHaveLength(0)
  })

  it('cancels the pending QR login with DELETE when the dialog is closed midway', async () => {
    const { qrCancels } = qrBackend({ states: [{ state: 'WAITING' }] })
    renderApp('/accounts?connect=new', { accounts: null })
    const user = userEvent.setup()

    await user.click(await (await opened()).findByRole('radio', { name: /Zalo/ }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    await user.click(wizard().getByRole('checkbox', { name: 'Tôi hiểu rủi ro' }))
    await user.click(wizard().getByRole('button', { name: 'Hiện mã QR' }))
    await wizard().findByRole('img', { name: 'Mã QR đăng nhập Zalo' })

    await user.click(wizard().getByRole('button', { name: 'Đóng' }))

    await vi.waitFor(() => expect(qrCancels).toEqual(['zalo/login-1']))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reconnects an AUTH_EXPIRED Zalo account via "Quét QR lại" without calling initial-sync', async () => {
    const { qrStarts, initialSyncs } = qrBackend({
      accounts: [API_ACCOUNTS[0], EXPIRED_ZALO_ACCOUNT],
      states: [{ state: 'DONE', accountId: 'acc-zalo-exp', reconnected: true }],
    })
    renderApp('/accounts', { accounts: null })
    const user = userEvent.setup()

    const rescanLink = await screen.findByRole('link', { name: 'Quét QR lại' })
    expect(rescanLink).toHaveAttribute('href', '/accounts?reconnect=acc-zalo-exp')
    await user.click(rescanLink)

    expect(await (await opened()).findByText(/Sino kết nối Zalo bằng cách không chính thức\./)).toBeInTheDocument()
    await user.click(wizard().getByRole('checkbox', { name: 'Tôi hiểu rủi ro' }))
    await user.click(wizard().getByRole('button', { name: 'Hiện mã QR' }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(qrStarts).toEqual([['zalo', { acceptRisk: true, accountId: 'acc-zalo-exp' }]])
    expect(initialSyncs).toHaveLength(0)
  })
})
