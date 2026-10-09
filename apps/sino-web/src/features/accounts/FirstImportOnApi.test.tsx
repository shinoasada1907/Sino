import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS, apiInitialSync } from '@/test/fixtures/accountsApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

const RUNNING = apiInitialSync({ status: 'RUNNING', imported: 412, remainingMinutes: 3, storedMessages: 412, finishedAt: null })
const NOT_STARTED = apiInitialSync({ status: 'NOT_STARTED', range: null, imported: 0, estimated: null, storedMessages: 0, startedAt: null, finishedAt: null })
const failed = (errorCode: string, range = 'DAYS_90') => apiInitialSync({ status: 'FAILED', range, imported: 412, storedMessages: 412, errorCode })

const ACCOUNTS = [
  ...API_ACCOUNTS,
  { ...API_ACCOUNTS[0], id: 'acc-3', externalAccountId: 'ban.hang@gmail.com', displayName: 'Bán hàng' },
  { ...API_ACCOUNTS[0], id: 'acc-4', externalAccountId: 'chua.nhap@gmail.com', displayName: 'Chưa nhập' },
]

/** The accounts of the backend, with the statuses each one's first import gives one read after another. */
function backend(imports: Record<string, object[]>) {
  const starts: unknown[] = []
  const reads: Record<string, number> = {}
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/accounts/:id/initial-sync/estimate', () => HttpResponse.json({ messages: 1180, minMinutes: 3, maxMinutes: 5 })),
    http.post('/api/accounts/:id/initial-sync', async ({ params, request }) => {
      starts.push([params.id, await request.json()])
      return HttpResponse.json(RUNNING, { status: 202 })
    }),
    http.get('/api/accounts/:id/initial-sync', ({ params }) => {
      const id = params.id as string
      const statuses = imports[id] ?? [NOT_STARTED]
      reads[id] = (reads[id] ?? -1) + 1
      return HttpResponse.json(statuses[Math.min(reads[id], statuses.length - 1)])
    }),
  )
  return starts
}

const row = (address: string) => within(screen.getByRole('row', { name: new RegExp(address.replace('.', '\\.')) }))

describe('the first import on the Tài khoản pages (FE-52)', () => {
  it('shows the first import of each account in the list, and follows a running one until it is done', async () => {
    backend({ 'acc-1': [RUNNING, apiInitialSync()], 'acc-3': [failed('RATE_LIMITED')] })
    renderApp('/accounts', { accounts: null })

    expect(await screen.findByText('Đang đồng bộ · 35%')).toBeInTheDocument()
    expect(row('an.nguyen@gmail.com').getByText('Đang đồng bộ · 35%')).toBeInTheDocument()
    expect(row('cong.viec@gmail.com').getByText('Tạm dừng')).toBeInTheDocument()
    expect(row('ban.hang@gmail.com').getByText('Lỗi đồng bộ')).toBeInTheDocument()
    expect(row('chua.nhap@gmail.com').getByText('Chưa đồng bộ')).toBeInTheDocument()
    // The phone list says the same instead of "Ổn định".
    const phone = within(screen.getByRole('navigation', { name: 'Tài khoản đã kết nối' }))
    expect(within(phone.getByRole('link', { name: /ban\.hang@gmail\.com/ })).getByText('Lỗi đồng bộ')).toBeInTheDocument()
    expect(within(phone.getByRole('link', { name: /chua\.nhap@gmail\.com/ })).getByText('Chưa đồng bộ')).toBeInTheDocument()

    // The list is asked again every 2 s while an import runs.
    expect(await row('an.nguyen@gmail.com').findByText('Đang hoạt động', {}, { timeout: 4000 })).toBeInTheDocument()
  })

  it('offers to import an account that has no mail yet, from its detail', async () => {
    backend({})
    renderApp('/accounts/acc-1', { accounts: null })
    const user = userEvent.setup()

    expect(await screen.findByText('Sino chưa nhập thư nào của tài khoản này. Nhập để đọc trong Hộp thư.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Đồng bộ ngay' })).toHaveAttribute('href', '/accounts?sync=acc-1')
    await user.click(screen.getByRole('link', { name: 'Nhập thư' }))

    expect(await screen.findByRole('dialog', { name: 'Tùy chọn đồng bộ' })).toBeInTheDocument()
    expect(await within(screen.getByRole('dialog')).findByText('khoảng 1.180 thư')).toBeInTheDocument()
  })

  it('goes on with an import that stopped, on its range, from the detail', async () => {
    const starts = backend({ 'acc-1': [failed('RATE_LIMITED', 'DAYS_30'), RUNNING] })
    renderApp('/accounts/acc-1', { accounts: null })
    const user = userEvent.setup()

    expect(await screen.findByText('Gmail đang giới hạn số lần đọc. Đợi vài phút rồi thử lại.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nhập tiếp' }))

    expect(await screen.findAllByText('Đang đồng bộ · 35%')).not.toHaveLength(0)
    expect(starts).toEqual([['acc-1', { range: 'DAYS_30' }]])
    expect(screen.queryByText('Gmail đang giới hạn số lần đọc. Đợi vài phút rồi thử lại.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Đồng bộ ngay' })).toBeDisabled()
  })

  it('sends an account whose import lost its access to sign in again', async () => {
    backend({ 'acc-1': [failed('AUTH_EXPIRED')] })
    renderApp('/accounts/acc-1', { accounts: null })

    expect(await screen.findByText('Sino không còn quyền đọc Gmail của tài khoản này. Hãy đăng nhập lại.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toHaveAttribute('href', '/accounts?reconnect=acc-1')
  })

  it('counts the stored mail of an imported account, and asks nothing more of it', async () => {
    backend({ 'acc-1': [apiInitialSync({ storedMessages: 1284 })] })
    renderApp('/accounts/acc-1', { accounts: null })

    const channels = within(await screen.findByRole('region', { name: 'Kênh đã kết nối' }))
    expect(await channels.findByText('1.284 thư đã lưu')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nhập tiếp' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Nhập thư' })).toBeNull()
  })
})
