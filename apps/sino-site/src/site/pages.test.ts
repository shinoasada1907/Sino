import { describe, expect, it } from 'vitest'
import { pageForPath } from './pages'

describe('pageForPath', () => {
  it.each([
    ['/', 'brand'],
    ['/index.html', 'brand'],
    ['/messages', 'messages'],
    ['/messages/', 'messages'],
    ['/messages/index.html', 'messages'],
    ['/nope', 'not-found'],
  ])('shows %s as the %s page in pnpm dev', (path, id) => {
    expect(pageForPath(path).id).toBe(id)
  })
})
