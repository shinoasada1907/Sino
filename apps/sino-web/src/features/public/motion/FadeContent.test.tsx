// Copied from apps/sino-site/src/shared/motion/FadeContent.test.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { stubReducedMotion } from '@/test/matchMedia'
import { FadeContent } from './FadeContent'
import { fadeMotion } from './motion-values'

/** Puts every element at `top` px from the top of a 900 px tall window. */
function placeAt(top: number) {
  vi.stubGlobal('innerHeight', 900)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: top, width: 300, height: 200 }),
  )
}

describe('fadeMotion', () => {
  it('fades in and rises 6 px in 240 ms, as the canvas FadeContent does', () => {
    expect(fadeMotion(false)).toEqual({ y: 6, duration: 0.24 })
  })

  it('only fades, in 160 ms, when the user asks for less motion', () => {
    expect(fadeMotion(true)).toEqual({ y: 0, duration: 0.16 })
  })
})

describe('FadeContent', () => {
  it('hides content below the first screen until it is scrolled to', () => {
    placeAt(2000)
    render(<FadeContent>Câu hỏi</FadeContent>)

    const box = screen.getByText('Câu hỏi')
    expect(box.style.visibility).toBe('hidden')
    expect(box.style.transform).toContain('6px')
  })

  it('leaves content alone that is already on screen when the page appears', () => {
    placeAt(300)
    render(<FadeContent>Kết nối với</FadeContent>)

    expect(screen.getByText('Kết nối với').getAttribute('style')).toBeNull()
  })

  it('does not move content when the user asks for less motion', () => {
    stubReducedMotion(true)
    placeAt(2000)
    render(<FadeContent>Câu hỏi</FadeContent>)

    const box = screen.getByText('Câu hỏi')
    expect(box.style.visibility).toBe('hidden')
    expect(box.style.transform).not.toContain('6px')
  })
})
