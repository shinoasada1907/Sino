import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS, apiInitialSync, apiSyncStatus } from '@/test/fixtures/accountsApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

const problem = (status: number, code: string) =>
  HttpResponse.json({ title: code, status, code }, { status, headers: { 'Content-Type': 'application/problem+json' } })
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

/** An imported account and its live sync (BE-48): its status, and what `POST …/sync` answers. */
function backend({ status = apiSyncStatus(), start = () => HttpResponse.json(apiSyncStatus(), { status: 202 }) } = {}) {
  const asked: string[] = []
  server.use(
    http.get('/api/accounts', () => HttpResponse.json([API_ACCOUNTS[0]])),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(apiInitialSync())),
    http.get('/api/accounts/:id/sync', () => HttpResponse.json(status)),
    http.post('/api/accounts/:id/sync', ({ params }) => {
      asked.push(String(params.id))
      return start()
    }),
  )
  return asked
}

describe('live sync on the account detail (FE-55, D-95)', () => {
  it('syncs an imported account at once, without the sync step, and says how new mail comes', async () => {
    const asked = backend({ status: apiSyncStatus({ lastSyncAt: minutesAgo(2) }) })
    renderApp('/accounts/acc-1', { accounts: null })
    const user = userEvent.setup()

    expect(await screen.findByText('Đồng bộ lần cuối 2 phút trước · thư mới về sau khoảng 1 phút')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Đồng bộ ngay' }))

    await vi.waitFor(() => expect(asked).toEqual(['acc-1']))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says new mail comes at once while Gmail pushes, and names the last sync error', async () => {
    backend({ status: apiSyncStatus({ lastSyncAt: minutesAgo(0), push: 'ACTIVE', lastError: 'PROVIDER_UNAVAILABLE' }) })
    renderApp('/accounts/acc-1', { accounts: null })

    expect(await screen.findByText('Đồng bộ lần cuối vừa xong · thư mới về ngay')).toBeInTheDocument()
    expect(screen.getByText('Lần đồng bộ gần nhất lỗi: Gmail chưa trả lời. Hãy thử lại sau.')).toBeInTheDocument()
  })

  it('says why it cannot sync now', async () => {
    const cases: [string, string][] = [
      ['IMPORT_NOT_DONE', 'Lần nhập đầu chưa xong nên chưa đồng bộ được.'],
      ['ACCOUNT_DISABLED', 'Tài khoản này đang tắt nhận thư. Bật lại trong chi tiết tài khoản rồi thử lại.'],
    ]
    for (const [code, text] of cases) {
      backend({ start: () => problem(409, code) })
      const view = renderApp('/accounts/acc-1', { accounts: null })
      const user = userEvent.setup()

      await user.click(await screen.findByRole('button', { name: 'Đồng bộ ngay' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(text)
      view.unmount()
    }
  })
})
