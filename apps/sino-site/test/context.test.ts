import { describe, expect, it } from 'vitest'
import { createContext } from '../src/context.ts'
import { EMPTY_CONFIG, FULL_CONFIG } from './fixtures/configs.ts'

describe('createContext', () => {
  it('writes a filled value as escaped text', () => {
    const ctx = createContext({ ...FULL_CONFIG, owner: 'A & B' }, 'production')

    expect(ctx.value('owner').value).toBe('A &amp; B')
  })

  it('marks a missing value in a preview build', () => {
    const ctx = createContext(EMPTY_CONFIG, 'preview')

    expect(ctx.value('contactEmail').value).toBe('<span class="ph">[chưa điền: email liên hệ]</span>')
  })

  it('links into the app from its configured URL', () => {
    const ctx = createContext(FULL_CONFIG, 'production')

    expect(ctx.appHref('/login')).toBe('https://app.sino.example/login')
  })

  it('makes the canonical URL from the site URL', () => {
    expect(createContext(FULL_CONFIG, 'production').canonical('/privacy')).toBe('https://sino.example/privacy')
    expect(createContext(EMPTY_CONFIG, 'preview').canonical('/privacy')).toBe('/privacy')
  })
})
