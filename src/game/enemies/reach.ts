/**
 * "Reached its target" rule (waves spec R2) — moved out of loop.ts so it is testable.
 */

import type { Enemy } from '../state'
import { pathExits } from '../paths'

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
 * Splits enemies into those still coming and the number that reached their
 * target. In the bonus round nothing can ever be missed (R5.3).
 */
export function splitReached(
  enemies: Enemy[],
  bonus: boolean,
): { survivors: Enemy[]; missed: number } {
  if (bonus) return { survivors: enemies, missed: 0 }
  const survivors: Enemy[] = []
  let missed = 0
  for (const e of enemies) {
    if (isThreat(e) && Math.hypot(e.x - e.targetX, e.y - e.targetY) <= CENTER_THRESHOLD) missed++
    else survivors.push(e)
  }
  return { survivors, missed }
}
