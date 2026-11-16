import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type ReactNode, useEffect } from 'react'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchInbox } from '@/features/inbox/inbox.api'
import { createInboxSample, frameOf, type InboxSample } from '@/features/inbox/inbox.sample'
import { inboxKey } from '@/features/inbox/useInbox'
import { publishConversationsChanged, type ConversationsChanged } from '@/shared/realtime/streamState'
import { serveInboxSample } from '@/test/inboxSampleApi'
import { useArrivalNotices } from './useArrivalNotices'

// Requests for the frame of the inbox are answered from the served sample, and counted.
vi.mock('@/features/inbox/inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

const sample: InboxSample = createInboxSample(new Date('2026-10-19T09:00:00Z'))
const ZALO = sample.accounts.find((account) => account.provider === 'zalo')!.id
const GMAIL = sample.accounts.find((account) => account.provider === 'gmail')!.id

const event = (accountId: string, newInbound: number, source: ConversationsChanged['source'] = 'sync') =>
  publishConversationsChanged({ accountId, conversationIds: ['c-1'], newInbound, source, at: '2026-10-19T09:00:00Z' })

/** Lets the notice finish: an event is resolved to a kind before it is counted. */
const settle = () => act(async () => undefined)

// How a test moves about the app: the router's `navigate`, handed over once the probe has rendered.
const go = { to: (_path: string) => {} }
function NavProbe() {
  const navigate = useNavigate()
  useEffect(() => {
    go.to = navigate
  })
  return null
}

function setup({ path = '/tasks', frame = true }: { path?: string; frame?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (frame) {
    queryClient.setQueryData(inboxKey('EMAIL'), frameOf(sample, 'EMAIL'))
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <NavProbe />
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { queryClient, ...renderHook(() => useArrivalNotices(), { wrapper }) }
}

function tab(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  serveInboxSample(sample)
  vi.mocked(fetchInbox).mockClear()
})

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState')
  vi.useRealTimers()
})

describe('useArrivalNotices (D-318)', () => {
  it('counts the new chats of a sync as one notice of Tin nhắn', async () => {
    const { result } = setup()

    event(ZALO, 1)
    await settle()

    expect(result.current.notices).toEqual([{ kind: 'CHAT', count: 1 }])
  })

  it('adds up what arrives before the notice is dismissed', async () => {
    const { result } = setup()

    event(ZALO, 1)
    event(ZALO, 2)
    await settle()

    expect(result.current.notices).toEqual([{ kind: 'CHAT', count: 3 }])
  })

  it('keeps one notice per kind, chats first', async () => {
    const { result } = setup()

    event(GMAIL, 1)
    event(ZALO, 2)
    await settle()

    expect(result.current.notices).toEqual([
      { kind: 'CHAT', count: 2 },
      { kind: 'EMAIL', count: 1 },
    ])
  })

  it('does not count an import, a change of the user, or an event with nothing new', async () => {
    const { result } = setup()

    event(ZALO, 300, 'import')
    event(ZALO, 1, 'user')
    event(ZALO, 0)
    await settle()

    expect(result.current.notices).toEqual([])
  })

  it('does not count what the open list already shows', async () => {
    const { result } = setup({ path: '/messages' })

    event(ZALO, 1)
    await settle()

    expect(result.current.notices).toEqual([])
  })

  it('does not count it on a conversation of that screen either', async () => {
    const { result } = setup({ path: '/messages/z-1' })

    event(ZALO, 1)
    await settle()

    expect(result.current.notices).toEqual([])
  })

  it('counts chats when the owner is on the other list', async () => {
    const { result } = setup({ path: '/inbox' })

    event(ZALO, 1)
    await settle()

    expect(result.current.notices).toEqual([{ kind: 'CHAT', count: 1 }])
  })

  it('counts it on its own screen when the tab is hidden', async () => {
    const { result } = setup({ path: '/messages' })
    act(() => tab('hidden'))

    event(ZALO, 1)
    await settle()

    expect(result.current.notices).toEqual([{ kind: 'CHAT', count: 1 }])
  })

  it('lets it go 6 seconds after the tab shows again on its screen', async () => {
    vi.useFakeTimers()
    const { result } = setup({ path: '/messages' })
    act(() => tab('hidden'))
    event(ZALO, 1)
    await settle()

    act(() => tab('visible'))
    act(() => void vi.advanceTimersByTime(5_900))
    expect(result.current.notices).toEqual([{ kind: 'CHAT', count: 1 }])
    act(() => void vi.advanceTimersByTime(200))

    expect(result.current.notices).toEqual([])
  })

  it('keeps the notice for as long as the tab stays hidden', async () => {
    vi.useFakeTimers()
    const { result } = setup({ path: '/messages' })
    act(() => tab('hidden'))
    event(ZALO, 1)
    await settle()

    act(() => void vi.advanceTimersByTime(60_000))

    expect(result.current.notices).toEqual([{ kind: 'CHAT', count: 1 }])
  })

  it('keeps a notice of the other screen when the tab shows again', async () => {
    vi.useFakeTimers()
    const { result } = setup({ path: '/tasks' })
    act(() => tab('hidden'))
    event(ZALO, 1)
    await settle()

    act(() => tab('visible'))
    act(() => void vi.advanceTimersByTime(60_000))

    expect(result.current.notices).toEqual([{ kind: 'CHAT', count: 1 }])
  })

  it('forgets a kind when it is dismissed, and only that one', async () => {
    const { result } = setup()
    event(ZALO, 2)
    event(GMAIL, 1)
    await settle()

    act(() => result.current.dismiss('CHAT'))

    expect(result.current.notices).toEqual([{ kind: 'EMAIL', count: 1 }])
  })

  it('forgets a kind when the owner opens its screen', async () => {
    const { result } = setup()
    event(ZALO, 2)
    event(GMAIL, 1)
    await settle()

    act(() => go.to('/messages'))

    expect(result.current.notices).toEqual([{ kind: 'EMAIL', count: 1 }])
  })

  it('asks for the accounts once when no screen has been opened yet', async () => {
    const { result } = setup({ frame: false })

    event(ZALO, 1)
    await waitFor(() => expect(result.current.notices).toEqual([{ kind: 'CHAT', count: 1 }]))
    event(GMAIL, 1)
    await waitFor(() => expect(result.current.notices).toHaveLength(2))

    expect(fetchInbox).toHaveBeenCalledTimes(1)
  })

  it('does not even look up the account of an event that brought nothing new', async () => {
    const { result } = setup({ frame: false })

    event(ZALO, 0)
    await settle()

    expect(result.current.notices).toEqual([])
    expect(fetchInbox).not.toHaveBeenCalled()
  })

  it('does not ask for anything when a frame is already there', async () => {
    const { result } = setup()

    event(ZALO, 1)
    await settle()

    expect(result.current.notices).toHaveLength(1)
    expect(fetchInbox).not.toHaveBeenCalled()
  })

  it('reads the accounts again for an account the frame has not seen', async () => {
    const { queryClient, result } = setup()
    const withoutZalo = frameOf({ ...sample, accounts: sample.accounts.filter((account) => account.id !== ZALO) }, 'EMAIL')
    queryClient.setQueryData(inboxKey('EMAIL'), withoutZalo)

    event(ZALO, 1)
    await waitFor(() => expect(result.current.notices).toEqual([{ kind: 'CHAT', count: 1 }]))

    expect(fetchInbox).toHaveBeenCalledTimes(1)
  })

  it('reads the accounts once, not at every event of an account that is not there', async () => {
    setup({ frame: false })

    event('acc-nobody', 1)
    await settle()
    event('acc-nobody', 1)
    await settle()

    expect(fetchInbox).toHaveBeenCalledTimes(1)
  })

  it('says nothing about an account no frame knows', async () => {
    const { result } = setup()

    event('acc-nobody', 1)
    await settle()

    expect(result.current.notices).toEqual([])
  })
})
