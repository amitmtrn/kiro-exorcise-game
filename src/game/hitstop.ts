/**
 * Hit-stop (juice R3): a short freeze of game time on every scoring banish.
 * Pure budget arithmetic in milliseconds; the loop feeds `liveMs` to the
 * simulation and keeps camera, hit detection and rendering on the real delta.
 */

export const HITSTOP_MS = 60

/** Overlapping freezes do not add up: the longer remainder wins. */
export function addHitStop(currentMs: number, ms: number = HITSTOP_MS): number {
  return Math.max(0, currentMs, ms)
}

export interface HitStopSplit {
  /** Part of this step spent frozen. */
  frozenMs: number
  /** Part of this step the simulation advances. */
  liveMs: number
  /** Freeze budget left after this step. */
  remainingMs: number
}

/** frozen + live = deltaMs, and the freeze budget is consumed exactly once. */
export function splitHitStop(remainingMs: number, deltaMs: number): HitStopSplit {
  const delta = Math.max(0, deltaMs)
  const budget = Math.max(0, remainingMs)
  const frozenMs = Math.min(budget, delta)
  return { frozenMs, liveMs: delta - frozenMs, remainingMs: budget - frozenMs }
}
