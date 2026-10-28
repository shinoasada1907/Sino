// Copied from apps/sino-site/src/shared/motion/AnimatedList.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
// Adapted from React Bits AnimatedList (https://reactbits.dev, MIT + Commons Clause), cut to the canvas Motion map (D-252).
import { Children, type ReactNode } from 'react'

const STAGGER_MS = 40
const MAX_MOVING = 6

/**
 * Rows that arrive one after another (MotionSpec C): each slides 6 px and fades in, 40 ms after the one before; at most
 * six move, later rows are simply there. Plain CSS animation, so it plays as soon as the rows are drawn;
 * with less motion the rows only fade.
 */
export function AnimatedList({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div className={className}>
      {Children.toArray(children).map((child, i) =>
        i < MAX_MOVING ? (
          <div
            key={i}
            className="motion-safe:animate-row-in motion-reduce:animate-fade-in"
            style={{ animationDelay: `${delay + i * STAGGER_MS}ms` }}
          >
            {child}
          </div>
        ) : (
          <div key={i}>{child}</div>
        ),
      )}
    </div>
  )
}
