import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SoonButton } from './soon-button'

describe('SoonButton', () => {
  it('keeps its label, is marked disabled and does nothing when clicked', async () => {
    const onClick = vi.fn()
    render(<SoonButton onClick={onClick}>Đồng bộ tất cả</SoonButton>)
    const button = screen.getByRole('button', { name: 'Đồng bộ tất cả' })

    expect(button).toHaveAttribute('aria-disabled', 'true')
    await userEvent.setup().click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it('says "Sắp có" on hover', async () => {
    const user = userEvent.setup()
    render(<SoonButton aria-label="Sửa">x</SoonButton>)

    await user.hover(screen.getByRole('button', { name: 'Sửa' }))

    expect((await screen.findAllByText('Sắp có')).length).toBeGreaterThan(0)
  })

  it('says "Sắp có" when the keyboard reaches it', async () => {
    const user = userEvent.setup()
    render(<SoonButton>Mở Gmail</SoonButton>)

    await user.tab()

    expect(screen.getByRole('button', { name: 'Mở Gmail' })).toHaveFocus()
    expect((await screen.findAllByText('Sắp có')).length).toBeGreaterThan(0)
  })
})
