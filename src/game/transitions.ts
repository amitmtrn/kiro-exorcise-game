/**
 * Easing and screen-transition poses (juice R4.3, R5). Pure functions of
 * elapsed milliseconds, so every animation is frame-rate independent.
 */

/** 0 → 0, 1 → 1, overshoots in between (back-out easing). */
export function easeOutBack(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
