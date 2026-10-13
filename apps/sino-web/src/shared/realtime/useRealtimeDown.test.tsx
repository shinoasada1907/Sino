import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setStreamState } from './streamState'
import { useRealtimeDown } from './useRealtimeDown'

describe('realtime that stays down (FE-55, D-94)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setStreamState('open')
  })

  afterEach(() => {
    setStreamState('connecting')
    vi.useRealTimers()
  })

  it('says so after 30 s without the stream, and no more once it opens again', () => {
    const { result } = renderHook(() => useRealtimeDown())

    act(() => setStreamState('connecting'))
    act(() => vi.advanceTimersByTime(29_000))
    expect(result.current).toBeNull()
    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current).toBe('connecting')

    act(() => setStreamState('open'))
    expect(result.current).toBeNull()

    // A new loss waits its own 30 s.
    act(() => setStreamState('connecting'))
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current).toBeNull()
  })

  it('tells a stream the browser gave up on', () => {
    const { result } = renderHook(() => useRealtimeDown())

    act(() => setStreamState('closed'))
    act(() => vi.advanceTimersByTime(30_000))

    expect(result.current).toBe('closed')
  })
})
