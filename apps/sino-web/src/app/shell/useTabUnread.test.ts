import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTabUnread } from './useTabUnread'

// index.html gives the page its title and its icon; jsdom does not load it, so each test brings them.
let icon: HTMLLinkElement

beforeEach(() => {
  document.title = 'Sino'
  icon = document.createElement('link')
  icon.rel = 'icon'
  icon.setAttribute('href', '/favicon.svg')
  document.head.append(icon)
})

afterEach(() => {
  icon.remove()
  document.title = ''
})

describe('useTabUnread (D-317)', () => {
  it('puts the count in the title and the dot on the icon', () => {
    renderHook(() => useTabUnread(3))

    expect(document.title).toBe('(3) Sino')
    expect(icon).toHaveAttribute('href', '/favicon-unread.svg')
  })

  it('says 99+ from 100', () => {
    renderHook(() => useTabUnread(150))
    expect(document.title).toBe('(99+) Sino')

    renderHook(() => useTabUnread(99))
    expect(document.title).toBe('(99) Sino')
  })

  it('goes back to the plain title and icon when there is nothing unread', () => {
    const { rerender } = renderHook(({ total }) => useTabUnread(total), { initialProps: { total: 3 } })

    rerender({ total: 0 })

    expect(document.title).toBe('Sino')
    expect(icon).toHaveAttribute('href', '/favicon.svg')
  })

  it('follows the count while the tab is not looked at', () => {
    const { rerender } = renderHook(({ total }) => useTabUnread(total), { initialProps: { total: 0 } })

    rerender({ total: 1 })

    expect(document.title).toBe('(1) Sino')
    expect(icon).toHaveAttribute('href', '/favicon-unread.svg')
  })

  it('leaves the title and the icon alone until the count has arrived', () => {
    document.title = 'Before'
    renderHook(() => useTabUnread(undefined))

    expect(document.title).toBe('Before')
    expect(icon).toHaveAttribute('href', '/favicon.svg')
  })

  it('gives back what it found when the app is left', () => {
    document.title = 'Before'
    icon.setAttribute('href', '/before.svg')
    const { unmount } = renderHook(() => useTabUnread(3))
    expect(document.title).toBe('(3) Sino')

    unmount()

    expect(document.title).toBe('Before')
    expect(icon).toHaveAttribute('href', '/before.svg')
  })

  it('still sets the title on a page that has no icon link', () => {
    icon.remove()

    renderHook(() => useTabUnread(2))

    expect(document.title).toBe('(2) Sino')
  })
})
