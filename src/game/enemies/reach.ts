/**
 * "Reached its target" rule (waves spec R2) — moved out of loop.ts so it is testable.
 */

import type { Enemy } from '../state'
import { pathExits, pathDurationMs } from '../paths'

/** An enemy within this many px of its target has reached it. */
export const CENTER_THRESHOLD = 40

/**
 * True when reaching the target costs a life. Skulls and the boss have their own
 * rules; harmless enemies and paths that end off screen (flyby, swarm, falling
 * through the bottom) are never threats.
 */
export function isThreat(e: Enemy): boolean {
  if (e.harmless) return false
  if (e.type === 'skull' || e.type === 'boss' || e.type === 'candy') return false
  if (e.path && pathExits(e.path)) return false
  return true
}

/**
 * A drop lands (and costs a life) only once its whole path time has run, so the
 * reaction window is the path duration — it never depends on how close the eased
 * position gets to the target in pixels. Other paths use the pixel threshold.
 */
function reached(e: Enemy, W: number, H: number): boolean {
  if (e.path?.kind === 'drop') return e.pathMs >= pathDurationMs(e.path, W, H)
  return Math.hypot(e.x - e.targetX, e.y - e.targetY) <= CENTER_THRESHOLD
}

/**
 * Splits enemies into those still coming and the number that reached their
 * target. In the bonus round nothing can ever be missed (R5.3).
 */
export function splitReached(
  enemies: Enemy[],
  bonus: boolean,
  canvasW: number,
  canvasH: number,
): { survivors: Enemy[]; missed: number } {
  if (bonus) return { survivors: enemies, missed: 0 }
  const survivors: Enemy[] = []
  let missed = 0
  for (const e of enemies) {
    if (isThreat(e) && reached(e, canvasW, canvasH)) missed++
    else survivors.push(e)
  }
  return { survivors, missed }
}
