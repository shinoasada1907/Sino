import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import { createAccountsSample } from './accounts.sample'

// The return on the full contract of fe-ui-connect, with sample providers; the first import itself is tested in
// InitialSyncOnApi.test.tsx.
vi.mock('./accounts.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./accounts.api')>()
  const { createConnectProvidersSample } = await import('./connect.sample')
  return {
    ...api,
    fetchConnectProviders: vi.fn(async () => createConnectProvidersSample()),
    leaveTo: vi.fn(),
  }
})

const RUNNING = { status: 'RUNNING', range: 'DAYS_90', imported: 0, estimated: null, remainingMinutes: null, storedMessages: 0, errorCode: null }

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW), accounts: createAccountsSample(NOW) })
}

const wizard = () => within(screen.getByRole('dialog'))

describe('coming back from the provider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    server.use(
      http.get('/api/accounts/:id/initial-sync/estimate', () => HttpResponse.json({ messages: null, minMinutes: null, maxMinutes: null })),
      http.post('/api/accounts/:id/initial-sync', () => HttpResponse.json(RUNNING, { status: 202 })),
      http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(RUNNING)),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the sync options of the account just connected, and drops the parameter', async () => {
    const { router } = open('/accounts?connected=acc-gmail')

    expect(await screen.findByRole('dialog', { name: 'Tùy chọn đồng bộ' })).toBeInTheDocument()
    expect(wizard().getByText('Kết nối tài khoản · 4/5')).toBeInTheDocument()
    expect(wizard().getByText('an.nguyen@gmail.com')).toBeInTheDocument()
    expect(wizard().getByText('Đã đăng nhập')).toBeInTheDocument()
    expect(wizard().queryByRole('button', { name: 'Quay lại' })).toBeNull()
    expect(router.state.location.pathname).toBe('/accounts')
    expect(router.state.location.search).toBe('')
  })

  it('shows the switches of the canvas and, once started, the account in step 5', async () => {
    open('/accounts?connected=acc-gmail')
    const user = userEvent.setup()
    await screen.findByRole('dialog', { name: 'Tùy chọn đồng bộ' })

    expect(wizard().getByRole('switch', { name: 'Chỉ tải tệp đính kèm khi bạn mở' })).toBeChecked()
    expect(wizard().getByRole('switch', { name: 'Dùng nhãn Gmail làm bộ lọc trong Sino' })).toBeChecked()
    await user.click(wizard().getByRole('button', { name: 'Bắt đầu đồng bộ' }))

    expect(await screen.findByRole('dialog', { name: 'Hoàn tất' })).toBeInTheDocument()
    expect(wizard().getByText('Kết nối tài khoản · 5/5')).toBeInTheDocument()
    expect(wizard().getByRole('heading', { name: 'Đã kết nối an.nguyen@gmail.com' })).toBeInTheDocument()
    expect(wizard().getByText('Sino đang đồng bộ lần đầu. Bạn dùng được ngay trong lúc chờ.')).toBeInTheDocument()
  })

  it('goes back to the provider step to connect one more account', async () => {
    open('/accounts?connected=acc-gmail')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Bắt đầu đồng bộ' }))

    await user.click(await wizard().findByRole('button', { name: 'Kết nối thêm tài khoản' }))

    expect(screen.getByRole('dialog', { name: 'Chọn nhà cung cấp' })).toBeInTheDocument()
  })

  it('ignores a connected account that is not in the list', async () => {
    const { router } = open('/accounts?connected=acc-khong-co')

    await screen.findByRole('table', { name: 'Tài khoản đã kết nối' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(router.state.location.search).toBe('')
  })

  it('tells each connect error in words, and offers to try again', async () => {
    const cases: [string, string][] = [
      ['CONNECT_CANCELLED', 'Bạn đã hủy kết nối.'],
      ['CONNECT_STATE_INVALID', 'Phiên kết nối đã hết hạn. Hãy thử lại.'],
      ['CONNECT_SCOPE_DENIED', 'Sino cần quyền đọc Gmail. Hãy thử lại và cho phép đọc thư.'],
      ['CONNECT_WRONG_ACCOUNT', 'Bạn đã chọn một tài khoản Google khác. Hãy chọn đúng tài khoản, hoặc dùng "Thêm Gmail".'],
      ['CONNECT_FAILED', 'Không kết nối được với Google. Hãy thử lại sau.'],
      ['SOMETHING_NEW', 'Không kết nối được với Google. Hãy thử lại sau.'],
    ]
    for (const [code, message] of cases) {
      const view = open(`/accounts?connectError=${code}`)
      const alerts = await screen.findAllByRole('alert')
      expect(alerts[0]).toHaveTextContent(message)
      expect(view.router.state.location.search).toBe('')
      view.unmount()
    }
  })

  it('tries again from the error, on the provider step', async () => {
    open('/accounts?connectError=CONNECT_CANCELLED')
    const user = userEvent.setup()
    const alert = (await screen.findAllByRole('alert'))[0]

    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(screen.getByRole('dialog', { name: 'Chọn nhà cung cấp' })).toBeInTheDocument()
    expect(screen.queryByText('Bạn đã hủy kết nối.')).toBeNull()
  })
})
