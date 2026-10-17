// Copied from apps/sino-site/src/shared/motion/AnimatedList.test.tsx (web-public-pages, D-312); change both together.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AnimatedList } from './AnimatedList'

describe('AnimatedList', () => {
  const rows = Array.from({ length: 8 }, (_, i) => <span key={i}>{`Thư ${i + 1}`}</span>)

  it('brings the rows in one after another, 40 ms apart, after the given delay', () => {
    render(<AnimatedList delay={120}>{rows}</AnimatedList>)

    const delays = rows.map((_, i) => screen.getByText(`Thư ${i + 1}`).parentElement!.style.animationDelay)
    expect(delays.slice(0, 6)).toEqual(['120ms', '160ms', '200ms', '240ms', '280ms', '320ms'])
  })

  it('moves at most six rows; the others are simply there', () => {
    render(<AnimatedList>{rows}</AnimatedList>)

    for (const name of ['Thư 7', 'Thư 8']) {
      const item = screen.getByText(name).parentElement!
      expect(item.style.animationDelay).toBe('')
      expect(item.className).not.toContain('animate')
    }
  })
})
