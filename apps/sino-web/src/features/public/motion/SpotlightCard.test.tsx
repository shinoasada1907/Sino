// Copied from apps/sino-site/src/shared/motion/SpotlightCard.test.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { stubReducedMotion } from '@/test/matchMedia'
import { SpotlightCard } from './SpotlightCard'

const nextFrames = () => new Promise((resolve) => setTimeout(resolve, 80))

function renderCard() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 100, y: 50, width: 400, height: 300 }),
  )
  render(<SpotlightCard data-testid="card">Hộp thư chung</SpotlightCard>)
  const card = screen.getByTestId('card')
  return { card, light: card.querySelector<HTMLElement>('[data-slot="spotlight"]')! }
}

describe('SpotlightCard', () => {
  it('lights the spot under the pointer while it is over the card', async () => {
    const { card, light } = renderCard()

    fireEvent.pointerMove(card, { clientX: 300, clientY: 150 })
    await nextFrames()

    expect(light.style.background).toContain('200px 100px')
    expect(Number(light.style.opacity)).toBeGreaterThan(0)
  })

  it('keeps the light still when the user asks for less motion', async () => {
    stubReducedMotion(true)
    const { card, light } = renderCard()

    fireEvent.pointerMove(card, { clientX: 300, clientY: 150 })
    await nextFrames()

    expect(light.style.background).toBe('')
  })
})
