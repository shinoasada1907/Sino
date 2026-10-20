import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS, apiInitialSync } from '@/test/fixtures/accountsApi'
import { FakeEventSource, lastStream } from '@/test/eventSource'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

const AT = '2026-10-02T07:05:00Z'

// The shell keeps the unread count on every page (D-93), so an inbox event reads it again.
function serveInboxFrame() {
  server.use(
    http.get('/api/conversations/counts', () =>
      HttpResponse.json({ unread: 0, byProvider: {}, needsReply: 0, withAttachments: 0, scheduled: 0, snoozed: 0 }),
    ),
  )
}
// The shell keeps the account list on every screen (NS-01), so an account event and a stream that opens again read it too.
function serveAccounts() {
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/accounts/:id/initial-sync', () => HttpResponse.json(apiInitialSync())),
  )
}
// An account of the inbox sample: the bar of the shell names the kind of the account of an event from the frame (NF-02).
const changed = { type: 'conversations.changed', accountId: 'acc-gmail', conversationIds: ['conv-1'], newInbound: 1, source: 'sync', at: AT }

describe('the event stream of the web (FE-53)', () => {
  it('opens one stream for the signed-in app, and none on the sign-in page', async () => {
    const view = renderApp('/overview')
    await screen.findByRole('heading', { level: 1 })

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(new URL(lastStream().url, 'http://localhost').pathname).toBe('/api/events/stream')
    view.unmount()
    expect(lastStream().readyState).toBe(FakeEventSource.CLOSED)

    FakeEventSource.instances = []
    renderApp('/login', { me: null })
    await screen.findByRole('button', { name: 'Đăng nhập' })
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('reads the inbox again when its conversations change, and the accounts when an account changes', async () => {
    serveInboxFrame()
    serveAccounts()
    const { queryClient } = renderApp('/overview')
    await screen.findByRole('heading', { level: 1 })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const stream = lastStream()
    stream.open()

    stream.emit('conversations.changed', changed)
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['inbox'], ['inbox-unread']])

    invalidate.mockClear()
    stream.emit('account.changed', { type: 'account.changed', accountId: 'acc-1', at: AT })
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['accounts'], ['inbox'], ['inbox-unread']])
    // The accounts are read again too (NS-01): leave no request in flight, or it lands in the next test and finds no handler.
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('reads both again when the stream opens again after a loss, not when it first opens', async () => {
    serveInboxFrame()
    serveAccounts()
    const { queryClient } = renderApp('/overview')
    await screen.findByRole('heading', { level: 1 })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const stream = lastStream()

    stream.open()
    expect(invalidate).not.toHaveBeenCalled()

    stream.drop()
    stream.open()
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['inbox'], ['inbox-unread'], ['accounts']])
    expect(FakeEventSource.instances).toHaveLength(1)
    // The accounts are read again too (NS-01): leave no request in flight, or it lands in the next test and finds no handler.
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('does not open a new stream itself when the browser gives up on it', async () => {
    renderApp('/overview')
    await screen.findByRole('heading', { level: 1 })

    lastStream().fail()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('reads the inbox again every minute while the stream is not open, since mail keeps coming (BE-49)', () => {
    serveInboxFrame()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const { queryClient } = renderApp('/overview')
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

      act(() => vi.advanceTimersByTime(60_000))
      expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['inbox'], ['inbox-unread']])

      invalidate.mockClear()
      act(() => lastStream().open())
      act(() => vi.advanceTimersByTime(120_000))
      expect(invalidate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks the account list again every 2 s during an import only while the stream is not open', async () => {
    let listReads = 0
    server.use(
      http.get('/api/accounts', () => {
        listReads += 1
        return HttpResponse.json([API_ACCOUNTS[0]])
      }),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
      http.get('/api/accounts/:id/initial-sync', () =>
        HttpResponse.json(apiInitialSync({ status: 'RUNNING', imported: 412, remainingMinutes: 3, storedMessages: 412, finishedAt: null })),
      ),
    )
    renderApp('/accounts', { accounts: null })
    expect(await screen.findByText('Đang đồng bộ · 35%')).toBeInTheDocument()
    lastStream().open()

    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(listReads).toBe(1)

    lastStream().drop()
    await vi.waitFor(() => expect(listReads).toBe(2), { timeout: 3000 })
  })
})
