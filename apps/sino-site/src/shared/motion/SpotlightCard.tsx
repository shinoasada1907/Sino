// Adapted from React Bits SpotlightCard (https://reactbits.dev, MIT + Commons Clause), cut to the canvas Motion map (D-252).
import { useEffect, useRef, type ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'
import { prefersReducedMotion } from './reduced-motion'

const SPOT_RADIUS = 260

/**
 * A card with a soft light (the canvas `--spot-strong`, 6–11 %) that follows the pointer while it is over the card, or
 * sits on the control that has keyboard focus. Kept from React Bits: the smoothed follow and fade. Dropped: shapes,
 * grain, flare, ambient drift, proximity and the theme palettes; the card's surface and border come from the caller.
 * With less motion no listener is attached, so only the still light the caller paints stays.
 */
export function SpotlightCard({ className, children, ...props }: ComponentProps<'div'>) {
  const root = useRef<HTMLDivElement>(null)
  const light = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const card = root.current
    const spot = light.current
    if (!card || !spot || prefersReducedMotion()) return

    const state = { x: 0, y: 0, toX: 0, toY: 0, presence: 0, target: 0 }
    let frame = 0
    let last = 0

    const tick = (now: number) => {
      frame = 0
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      const follow = 1 - Math.exp(-dt / 0.08)
      const fade = 1 - Math.exp(-dt / (state.target > state.presence ? 0.1 : 0.32))
      state.x += (state.toX - state.x) * follow
      state.y += (state.toY - state.y) * follow
      state.presence += (state.target - state.presence) * fade
      if (Math.abs(state.target - state.presence) < 0.002) state.presence = state.target
      spot.style.background = `radial-gradient(circle ${SPOT_RADIUS}px at ${Math.round(state.x)}px ${Math.round(state.y)}px, var(--spot-strong), transparent 70%)`
      spot.style.opacity = String(state.presence)
      const moving = Math.abs(state.toX - state.x) > 0.5 || Math.abs(state.toY - state.y) > 0.5
      if (moving || state.presence !== state.target) frame = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (frame) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
    const aim = (x: number, y: number) => {
      const box = card.getBoundingClientRect()
      state.toX = x - box.left
      state.toY = y - box.top
      // Coming back from nothing, start at the pointer instead of sliding in from the last spot.
      if (state.presence < 0.02) {
        state.x = state.toX
        state.y = state.toY
      }
      state.target = 1
      wake()
    }
    const onMove = (event: PointerEvent) => aim(event.clientX, event.clientY)
    const onLeave = () => {
      state.target = 0
      wake()
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(':focus-visible')) return
      const box = event.target.getBoundingClientRect()
      aim(box.left + box.width / 2, box.top + box.height / 2)
    }
    const onFocusOut = (event: FocusEvent) => {
      if (!card.contains(event.relatedTarget as Node | null)) onLeave()
    }

    card.addEventListener('pointermove', onMove)
    card.addEventListener('pointerleave', onLeave)
    card.addEventListener('focusin', onFocusIn)
    card.addEventListener('focusout', onFocusOut)
    return () => {
      cancelAnimationFrame(frame)
      card.removeEventListener('pointermove', onMove)
      card.removeEventListener('pointerleave', onLeave)
      card.removeEventListener('focusin', onFocusIn)
      card.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return (
    <div ref={root} className={cn('relative isolate', className)} {...props}>
      <span
        ref={light}
        data-slot="spotlight"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0"
      />
      {children}
    </div>
  )
}
