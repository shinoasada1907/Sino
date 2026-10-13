/** Whether the user asked the OS for less motion. Only call it in the browser (effects, event handlers). */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
