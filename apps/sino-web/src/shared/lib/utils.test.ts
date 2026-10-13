import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('lets the later class win when both set the same thing', () => {
    expect(cn('h-9 px-3', 'h-11')).toBe('px-3 h-11')
  })

  it('keeps a text size and a theme text colour together', () => {
    expect(cn('text-sm', 'text-muted-foreground')).toBe('text-sm text-muted-foreground')
  })

  it('treats the theme shadow `shadow-popover` as a shadow, so a later shadow replaces it', () => {
    expect(cn('shadow-popover', 'shadow-none')).toBe('shadow-none')
  })
})
