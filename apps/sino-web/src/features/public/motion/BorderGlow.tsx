// Copied from apps/sino-site/src/shared/motion/BorderGlow.tsx (web-public-pages, D-312); change both together.
// Adapted from React Bits BorderGlow (https://reactbits.dev, MIT + Commons Clause), cut to the canvas Motion map (D-252).
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { pointerAngle } from './motion-values'

/**
 * Around an important control: a 1 px light edge and a halo of at most 24 px, strongest on the side the pointer comes
 * from, while the pointer is over it; the whole ring while it has keyboard focus. Kept from React Bits: the cone that
 * follows the cursor angle and the halo behind a mask. Dropped: the mesh of colours, the intro sweep, edge
 * sensitivity; one colour, the canvas `--ring`. With less motion only the edge shows.
 */
export function BorderGlow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn('group/glow relative inline-flex rounded-sm', className)}
      onPointerMove={(event) => {
        const angle = pointerAngle(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY)
        event.currentTarget.style.setProperty('--glow-angle', `${Math.round(angle)}deg`)
      }}
    >
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 opacity-0 transition-opacity duration-(--dur-hover) ease-out mask-[conic-gradient(from_var(--glow-angle,0deg),#000_0%,#000_10%,transparent_30%,transparent_70%,#000_90%,#000_100%)] group-hover/glow:opacity-100 group-has-focus-visible/glow:opacity-100 group-has-focus-visible/glow:mask-none"
      >
        <span className="absolute inset-6 rounded-sm shadow-[0_0_0_1px_var(--ring),0_0_24px_-6px_var(--ring)] motion-reduce:shadow-[0_0_0_1px_var(--ring)]" />
      </span>
    </span>
  )
}
