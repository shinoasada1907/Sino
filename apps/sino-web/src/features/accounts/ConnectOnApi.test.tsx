import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
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

  it('back from the provider, says the account is connected and that its first sync comes later', async () => {
    backend()
    const { router } = renderApp('/accounts?connected=acc-1', { accounts: null })

    expect((await opened()).getByRole('heading', { name: 'Đã kết nối an.nguyen@gmail.com' })).toBeInTheDocument()
    expect(wizard().getByText('Sino chưa đồng bộ thư của tài khoản này; đồng bộ lần đầu sẽ có ở bản sau.')).toBeInTheDocument()
    expect(wizard().queryByRole('img', { name: /Đã đồng bộ/ })).toBeNull()
    expect(wizard().queryByRole('combobox')).toBeNull()
    expect(router.state.location.search).toBe('')
  })
})
