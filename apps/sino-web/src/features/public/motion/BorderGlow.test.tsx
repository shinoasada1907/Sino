// Copied from apps/sino-site/src/shared/motion/BorderGlow.test.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BorderGlow } from './BorderGlow'
import { pointerAngle } from './motion-values'

describe('pointerAngle', () => {
  const box = DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 40 })

  it.each([
    ['top', 100, 0, 0],
    ['right', 200, 20, 90],
    ['bottom', 100, 40, 180],
    ['left', 0, 20, 270],
  ])('points the glow at the %s edge', (_, x, y, angle) => {
    expect(pointerAngle(box, x, y)).toBeCloseTo(angle)
  })
})

describe('BorderGlow', () => {
  it('turns the glow towards the pointer', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 40 }),
    )
    render(
      <BorderGlow>
        <a href="/">Mở Sino</a>
      </BorderGlow>,
    )
    const glow = screen.getByRole('link').parentElement!

    fireEvent.pointerMove(glow, { clientX: 200, clientY: 20 })

    expect(glow.style.getPropertyValue('--glow-angle')).toBe('90deg')
  })
})
