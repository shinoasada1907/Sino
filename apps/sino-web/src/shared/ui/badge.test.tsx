import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge'

describe('Badge (Sunset tones)', () => {
  it('is the grey label by default', () => {
    render(<Badge>Tạm dừng</Badge>)
    const badge = screen.getByText('Tạm dừng')
    expect(badge).toHaveAttribute('data-tone', 'default')
    expect(badge).toHaveClass('bg-hover', 'text-muted-foreground', 'rounded-full')
  })

  it.each([
    ['accent', 'bg-brand-soft', 'text-brand-ink'],
    ['solid', 'bg-primary', 'text-primary-foreground'],
    ['honey', 'bg-honey-soft', 'text-honey'],
    ['dusk', 'bg-dusk-soft', 'text-dusk-ink'],
    ['ok', 'bg-success-soft', 'text-success'],
    ['bad', 'bg-danger-soft', 'text-danger'],
  ] as const)('the %s tone uses its soft background and coloured text', (tone, background, text) => {
    render(<Badge tone={tone}>Nhãn</Badge>)
    const badge = screen.getByText('Nhãn')
    expect(badge).toHaveAttribute('data-tone', tone)
    expect(badge).toHaveClass(background, text)
  })

  it('keeps a className from the caller', () => {
    render(<Badge tone="ok" className="ml-2">Ổn</Badge>)
    expect(screen.getByText('Ổn')).toHaveClass('ml-2', 'bg-success-soft')
  })
})
