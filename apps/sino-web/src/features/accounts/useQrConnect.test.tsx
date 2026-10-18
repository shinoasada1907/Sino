import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw/server'
import { useQrConnect } from './useQrConnect'

const CHALLENGE = { loginId: 'login-1', qrImage: 'data:image/png;base64,iVBORw0KGgo=', expiresAt: '2026-10-18T07:10:00Z' }
const RUNNING_SYNC = { status: 'RUNNING', range: 'ALL', imported: 0, estimated: null, remainingMinutes: null, storedMessages: 0, errorCode: null }

const start = http.post('/api/accounts/connect/:provider/qr', () => HttpResponse.json(CHALLENGE))

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

describe('useQrConnect, once the phone has confirmed the login', () => {
  it('keeps the challenge and the DONE state until the accounts have been read again', async () => {
    let answerSync: (() => void) | undefined
    server.use(
      start,
      http.get('/api/accounts/connect/:provider/qr/:loginId', () => HttpResponse.json({ state: 'DONE', accountId: 'acc-9', reconnected: false, displayName: 'Hà' })),
      http.post('/api/accounts/:id/initial-sync', async () => {
        await new Promise<void>((resolve) => (answerSync = resolve))
        return HttpResponse.json(RUNNING_SYNC)
      }),
    )
    const onDone = vi.fn()
    const { wrapper } = setup()
    const { result } = renderHook(() => useQrConnect(onDone), { wrapper })

    act(() => result.current.start('zalo', null))

    // The first import takes a moment: letting go of the login here emptied the QR step while it ran.
    await waitFor(() => expect(answerSync).toBeDefined())
    expect(result.current.challenge?.loginId).toBe('login-1')
    expect(result.current.status?.state).toBe('DONE')
    expect(onDone).not.toHaveBeenCalled()

    answerSync!()

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith({ accountId: 'acc-9', reconnected: false, provider: 'zalo', displayName: 'Hà' })
    expect(result.current.challenge).toBeNull()
  })
})

describe('useQrConnect, on a login the server is done with', () => {
  // The user scans on their phone and comes back to the browser, so both of these happen on every connect.
  // Both managers are shared by every test, and putting them back asks the queries still mounted here again: unmount first.
  afterEach(() => {
    cleanup()
    focusManager.setFocused(undefined)
    onlineManager.setOnline(true)
  })

  const expired = async () => {
    const asked: string[] = []
    server.use(
      start,
      http.get('/api/accounts/connect/:provider/qr/:loginId', ({ params }) => {
        asked.push(String(params.loginId))
        return HttpResponse.json({ state: 'EXPIRED' })
      }),
    )
    const { wrapper } = setup()
    const { result } = renderHook(() => useQrConnect(vi.fn()), { wrapper })

    act(() => result.current.start('zalo', null))
    await waitFor(() => expect(result.current.status?.state).toBe('EXPIRED'))
    expect(asked).toEqual(['login-1'])
    return { asked }
  }

  /** Long enough for a refetch to reach the fake network, so that "it asked nothing" means it. */
  const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)))

  it('does not ask again when the window regains focus', async () => {
    const { asked } = await expired()

    act(() => focusManager.setFocused(false))
    act(() => focusManager.setFocused(true))
    await settle()

    expect(asked).toEqual(['login-1'])
  })

  it('does not ask again when the browser reconnects', async () => {
    const { asked } = await expired()

    act(() => onlineManager.setOnline(false))
    act(() => onlineManager.setOnline(true))
    await settle()

    expect(asked).toEqual(['login-1'])
  })
})
