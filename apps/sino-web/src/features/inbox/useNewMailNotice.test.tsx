import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publishConversationsChanged } from '@/shared/realtime/streamState'
import { useNewMailNotice } from './useNewMailNotice'

const changed = (source: 'import' | 'sync' | 'user', newInbound: number) => ({
  accountId: 'acc-1',
  conversationIds: ['c-1'],
  newInbound,
  source,
  at: '2026-10-02T07:04:30Z',
})

describe('the "N thư mới" notice (FE-54, D-92)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts new mail from sync only, adding up events that come close together', () => {
    const { result } = renderHook(() => useNewMailNotice(['acc-1']))

    act(() => publishConversationsChanged(changed('sync', 2)))
    act(() => publishConversationsChanged(changed('user', 0)))
    act(() => publishConversationsChanged(changed('import', 40)))
    act(() => publishConversationsChanged(changed('sync', 0)))
    act(() => publishConversationsChanged(changed('sync', 1)))

    expect(result.current.count).toBe(3)
  })

  it('counts only the accounts of its screen, as given when the event comes (f05c)', () => {
    let accounts = ['acc-1']
    const { result, rerender } = renderHook(() => useNewMailNotice(accounts))

    act(() => publishConversationsChanged({ ...changed('sync', 5), accountId: 'acc-zalo' }))
    expect(result.current.count).toBe(0)
    accounts = ['acc-1', 'acc-zalo']
    rerender()
    act(() => publishConversationsChanged({ ...changed('sync', 2), accountId: 'acc-zalo' }))
    expect(result.current.count).toBe(2)
  })

  it('hides 6 s after the last new mail, or when dismissed', () => {
    const { result } = renderHook(() => useNewMailNotice(['acc-1']))

    act(() => publishConversationsChanged(changed('sync', 1)))
    act(() => vi.advanceTimersByTime(5000))
    act(() => publishConversationsChanged(changed('sync', 1)))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.count).toBe(2)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.count).toBe(0)

    act(() => publishConversationsChanged(changed('sync', 4)))
    act(() => result.current.dismiss())
    expect(result.current.count).toBe(0)
  })
})
