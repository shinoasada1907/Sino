import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// `GET /api/accounts/{id}/initial-sync` as BE-45 answers it.
const RUNNING = {
  status: 'RUNNING',
  range: 'DAYS_90',
  imported: 412,
  skipped: 3,
  estimated: 1180,
  remainingMinutes: 3,
  storedMessages: 412,
  startedAt: '2026-10-02T07:05:00Z',
  finishedAt: null,
  errorCode: null,
}
const DONE = { ...RUNNING, status: 'DONE', imported: 1180, remainingMinutes: null, storedMessages: 1180, finishedAt: '2026-10-02T07:09:00Z' }
const failed = (errorCode: string) => ({ ...RUNNING, status: 'FAILED', remainingMinutes: null, finishedAt: '2026-10-02T07:06:00Z', errorCode })
const problem = (status: number, code: string) =>
  HttpResponse.json({ title: code, status, code }, { status, headers: { 'Content-Type': 'application/problem+json' } })

const ESTIMATES: Record<string, object> = {
  DAYS_30: { messages: 420, minMinutes: 1, maxMinutes: 2 },
  DAYS_90: { messages: 1180, minMinutes: 3, maxMinutes: 5 },
  ALL: { messages: 9800, minMinutes: 20, maxMinutes: 35 },
}

/** The backend of FE-51: the estimate per range, the start, and the statuses the page reads one after another. */
function backend({ start = () => HttpResponse.json(RUNNING, { status: 202 }), statuses = [RUNNING, DONE] as object[] } = {}) {
  const asked = { estimates: [] as (string | null)[], starts: [] as unknown[] }
  let read = 0
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/accounts/:id/initial-sync/estimate', ({ request }) => {
      const range = new URL(request.url).searchParams.get('range')
      asked.estimates.push(range)
      return HttpResponse.json(ESTIMATES[range ?? ''])
    }),
    http.post('/api/accounts/:id/initial-sync', async ({ params, request }) => {
      asked.starts.push([params.id, await request.json()])
      return start()
    }),
    http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(statuses[Math.min(read++, statuses.length - 1)])),
  )
  return asked
}

const wizard = () => within(screen.getByRole('dialog'))
const backFromGoogle = () => renderApp('/accounts?connected=acc-1', { accounts: null })

describe('the first import after connecting, on the backend API (FE-51)', () => {
  it('asks how far back to import, with the estimate of the backend for each range', async () => {
    const asked = backend()
    backFromGoogle()
    const user = userEvent.setup()

    const range = await screen.findByRole('combobox', { name: 'Đồng bộ thư từ' })
    expect(screen.getByRole('dialog', { name: 'Tùy chọn đồng bộ' })).toBeInTheDocument()
    expect(range).toHaveValue('DAYS_90')
    expect(await wizard().findByText('khoảng 1.180 thư')).toBeInTheDocument()
    expect(wizard().getByText('3–5 phút')).toBeInTheDocument()

    await user.selectOptions(range, '30 ngày gần nhất')
    expect(await wizard().findByText('khoảng 420 thư')).toBeInTheDocument()
    expect(asked.estimates).toEqual(['DAYS_90', 'DAYS_30'])
  })

  it('starts the import of the picked range and follows it until it is done', async () => {
    const asked = backend()
    backFromGoogle()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Bắt đầu đồng bộ' }))

    expect(await screen.findByRole('dialog', { name: 'Hoàn tất' })).toBeInTheDocument()
    expect(asked.starts).toEqual([['acc-1', { range: 'DAYS_90' }]])
    expect(await wizard().findByText('412 / 1.180 thư · còn khoảng 3 phút')).toBeInTheDocument()
    expect(wizard().getByRole('img', { name: 'Đã đồng bộ 35%' })).toBeInTheDocument()
    // The page asks again every 2 s while the import runs.
    expect(await wizard().findByText('Đã nhập xong · 1.180 thư đã lưu', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(wizard().getByText('Sino đã nhập xong thư của tài khoản này. Mở hộp thư để đọc.')).toBeInTheDocument()
    expect(wizard().queryByRole('img', { name: /Đã đồng bộ/ })).toBeNull()
    expect(wizard().getByRole('link', { name: 'Mở hộp thư' })).toHaveAttribute('href', '/inbox')
  })

  it('says why an import stopped, and goes on with it on "Thử lại"', async () => {
    const asked = backend({ statuses: [failed('RATE_LIMITED'), RUNNING] })
    backFromGoogle()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Bắt đầu đồng bộ' }))

    expect(await wizard().findByText('Gmail đang giới hạn số lần đọc. Đợi vài phút rồi thử lại.')).toBeInTheDocument()
    await user.click(wizard().getByRole('button', { name: 'Thử lại' }))

    expect(await wizard().findByText('412 / 1.180 thư · còn khoảng 3 phút')).toBeInTheDocument()
    expect(asked.starts).toEqual([
      ['acc-1', { range: 'DAYS_90' }],
      ['acc-1', { range: 'DAYS_90' }],
    ])
  })

  it('sends an account that lost its access to sign in again', async () => {
    backend({ statuses: [failed('AUTH_EXPIRED')] })
    backFromGoogle()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Bắt đầu đồng bộ' }))

    expect(await wizard().findByText('Sino không còn quyền đọc Gmail của tài khoản này. Hãy đăng nhập lại.')).toBeInTheDocument()
    await user.click(wizard().getByRole('button', { name: 'Đăng nhập lại' }))

    expect(wizard().getByRole('button', { name: 'Đồng ý và tiếp tục' })).toBeInTheDocument()
  })

  it('says when an account that does not receive mail cannot be imported', async () => {
    backend({ start: () => problem(409, 'ACCOUNT_DISABLED') })
    backFromGoogle()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Bắt đầu đồng bộ' }))

    expect(await wizard().findByText('Tài khoản này đang tắt nhận thư. Bật lại trong chi tiết tài khoản rồi thử lại.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Tùy chọn đồng bộ' })).toBeInTheDocument()
  })
})
