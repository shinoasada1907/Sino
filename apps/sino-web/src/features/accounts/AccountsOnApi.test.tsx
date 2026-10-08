import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

const card = (name: string) => within(screen.getByRole('region', { name }))

function backend() {
  const calls: string[] = []
  let accounts = API_ACCOUNTS
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(accounts)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.patch('/api/accounts/:id', async ({ params, request }) => {
      calls.push(`PATCH ${params.id} ${JSON.stringify(await request.json())}`)
      return HttpResponse.json(accounts.find((account) => account.id === params.id))
    }),
    http.delete('/api/accounts/:id', ({ params }) => {
      calls.push(`DELETE ${params.id}`)
      accounts = accounts.filter((account) => account.id !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

describe('Tài khoản on the backend API (D-56)', () => {
  it('lists the accounts of the backend, without the numbers it does not give yet', async () => {
    backend()
    renderApp('/accounts', { accounts: null })

    expect(await screen.findByText('TÀI KHOẢN · 2 ĐÃ KẾT NỐI')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /an\.nguyen@gmail\.com/ })).toBeInTheDocument()
    expect(screen.getByText('Gmail cong.viec@gmail.com cần đăng nhập lại')).toBeInTheDocument()
    expect(screen.getByText('Quyền truy cập đã hết hạn. Thư mới tạm dừng; thư đã lưu vẫn còn.')).toBeInTheDocument()
    expect(screen.queryByText(/Đã lưu/)).toBeNull()
  })

  it('pauses automatic sync with the inbound switch, has no detail sections yet, and removes an account', async () => {
    const calls = backend()
    const { router } = renderApp('/accounts/acc-1', { accounts: null })
    const user = userEvent.setup()

    const channels = within(await screen.findByRole('region', { name: 'Kênh đã kết nối' }))
    expect(channels.getByText('1 bật · 0 tắt')).toBeInTheDocument()
    expect(channels.getAllByRole('switch')).toHaveLength(1)
    await user.click(channels.getByRole('switch', { name: 'Thư đến' }))
    expect(channels.getByRole('switch', { name: 'Thư đến' })).not.toBeChecked()
    expect(calls).toEqual(['PATCH acc-1 {"syncEnabled":false}'])

    for (const name of ['Quyền đã cấp', 'Website dùng danh tính này', 'Lịch sử đồng bộ', 'Hoạt động']) {
      expect(card(name).getByText('Chưa có dữ liệu')).toBeInTheDocument()
    }
    expect(screen.queryByText('Đã lưu')).toBeNull()

    await user.click(card('Ngắt kết nối tài khoản').getByRole('button', { name: 'Ngắt kết nối an.nguyen@gmail.com' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Ngắt kết nối Gmail?' }))
    expect(dialog.queryByRole('switch')).toBeNull()
    await user.click(dialog.getByRole('button', { name: 'Ngắt kết nối' }))

    expect(await screen.findByText('TÀI KHOẢN · 1 ĐÃ KẾT NỐI')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/accounts')
    expect(calls).toEqual(['PATCH acc-1 {"syncEnabled":false}', 'DELETE acc-1'])
  })

  it('says so when the list cannot load, and loads it again on "Thử lại"', async () => {
    let attempts = 0
    server.use(
      http.get('/api/accounts', () => {
        attempts += 1
        return attempts === 1
          ? HttpResponse.json({ title: 'Down', status: 503, code: 'SERVICE_UNAVAILABLE' }, { status: 503, headers: { 'Content-Type': 'application/problem+json' } })
          : HttpResponse.json(API_ACCOUNTS)
      }),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    )
    renderApp('/accounts', { accounts: null })
    const user = userEvent.setup()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không tải được danh sách tài khoản')
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByText('TÀI KHOẢN · 2 ĐÃ KẾT NỐI')).toBeInTheDocument()
  })

  it('says so on the detail page too when the list cannot load', async () => {
    server.use(
      http.get('/api/accounts', () => HttpResponse.error()),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    )
    renderApp('/accounts/acc-1', { accounts: null })

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được danh sách tài khoản')
  })
})
