import { describe, expect, it } from 'vitest'
import { HOME, safeReturnTo } from './returnTo'

describe('safeReturnTo', () => {
  it('keeps a path inside the app, with its query', () => {
    expect(safeReturnTo('/accounts')).toBe('/accounts')
    expect(safeReturnTo('/inbox/conv-1?view=unread')).toBe('/inbox/conv-1?view=unread')
  })

  it('goes home for anything that could leave the app', () => {
    expect(HOME).toBe('/overview')
    for (const value of ['//evil.example', 'https://evil.example', '/\\evil.example', 'accounts', '', null]) {
      expect(safeReturnTo(value)).toBe(HOME)
    }
  })

  it('does not send the user back to the sign-in page', () => {
    expect(safeReturnTo('/login')).toBe(HOME)
    expect(safeReturnTo('/login?returnTo=%2Faccounts')).toBe(HOME)
  })
})
