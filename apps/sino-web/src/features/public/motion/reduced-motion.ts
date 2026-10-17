// Copied from apps/sino-site/src/shared/motion/reduced-motion.ts (web-public-pages, D-312); change both together.
/** Whether the user asked the OS for less motion. Only call it in the browser (effects, event handlers). */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
