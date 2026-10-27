// Copied from apps/sino-site/src/shared/motion/motion-values.ts (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
/** Canvas FadeContent: fade in and rise 6 px in 240 ms; with less motion only fade, in 160 ms. */
export function fadeMotion(reduce: boolean) {
  return reduce ? { y: 0, duration: 0.16 } : { y: 6, duration: 0.24 }
}

/** Degrees from the top edge, clockwise, of the point (x, y) seen from the centre of `box` (React Bits `getCursorAngle`). */
export function pointerAngle(box: DOMRect, x: number, y: number): number {
  const dx = x - (box.left + box.width / 2)
  const dy = y - (box.top + box.height / 2)
  if (dx === 0 && dy === 0) return 0
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90
  return degrees < 0 ? degrees + 360 : degrees
}
