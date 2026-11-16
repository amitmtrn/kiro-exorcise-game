/**
 * Skull lanes (playtest3-fixes R2). A skull costs a heart when touched, so harmless targets must never
 * send the player's hand through it: the corridor from the skull's entry edge to its hover point is kept
 * clear of every path enemy, in both directions (new enemies avoid a live skull, a new skull avoids the
 * lanes already on screen). Pure; positions come from the closed-form `pathPosition`, so sway is included
 * and nothing here depends on the frame rate.
 */

import type { Enemy } from './state'
import type { PathSpec } from './paths'
import { pathDurationMs, pathPosition } from './paths'
import type { Rect } from './zones'
import { SKULL_SIZE } from './enemies/skull'
import { DEMO } from '../demo/params'

/** Hitbox scale used by `hitboxFor` (kept in step with skull.ts / movement.ts). */
const HITBOX_SCALE = 1.2
/** Path sampling step, ms of path time (a bat covers ≈ 20 px in this time). */
const SAMPLE_MS = 20
/** Sampling slack: the zone is grown by this many px when sampling, so a path cannot slip through a corner between two samples. */
const SLACK_PX = 24
/** The clearance never exceeds this share of the area height (very small areas, such as a 2P half of a tiny window). */
const MAX_CLEARANCE_H = 0.2

/** One hand radius at area height `H` (same rule as the demo hand and the motion buttons). */
function handRadiusPx(H: number): number {
  return Math.min(DEMO.handMaxPx, Math.max(DEMO.handMinPx, DEMO.handRadiusH * H))
}

/** Clearance between a skull's lane and any other path: one hand radius plus one skull hitbox width. */
export function skullClearancePx(H: number): number {
  return Math.min(handRadiusPx(H) + SKULL_SIZE * HITBOX_SCALE, MAX_CLEARANCE_H * H)
}

/**
 * The skull's lane grown by the clearance: a horizontal band around its hover row, from beyond its entry
 * edge to just past its hover point (it enters and leaves along this corridor).
 */
export function skullZone(skull: Pick<Enemy, 'targetX' | 'targetY'>, W: number, H: number): Rect {
  const half = SKULL_SIZE * HITBOX_SCALE / 2
  const c = skullClearancePx(H)
  const fromLeft = skull.targetX < W / 2
  const big = 4 * Math.max(W, H)
  const x0 = fromLeft ? -big : skull.targetX - half - c
  const x1 = fromLeft ? skull.targetX + half + c : W + big
  return { x: x0, y: skull.targetY - half - c, w: x1 - x0, h: 2 * (half + c) }
}

const inside = (r: Rect, x: number, y: number): boolean =>
  x > r.x - SLACK_PX && x < r.x + r.w + SLACK_PX && y > r.y - SLACK_PX && y < r.y + r.h + SLACK_PX

/** True when the path, from `fromMs` of path time to its end, passes through any zone. */
export function pathHitsZone(p: PathSpec, W: number, H: number, zones: readonly Rect[], fromMs = 0): boolean {
  if (zones.length === 0) return false
  const end = pathDurationMs(p, W, H)
  for (let t = Math.max(0, fromMs); ; t += SAMPLE_MS) {
    const q = pathPosition(p, Math.min(t, end), W, H)
    for (const z of zones) if (inside(z, q.x, q.y)) return true
    if (t >= end) return false
  }
}

/** The zones of every active skull (a skull that is already leaving is gone within a second and keeps no lane). */
export function skullZones(enemies: readonly Enemy[], W: number, H: number): Rect[] {
  return enemies.filter((e) => e.type === 'skull' && !e.exiting).map((e) => skullZone(e, W, H))
}

/** True when a skull with this hover point would sit in the remaining lane of an enemy on screen. */
export function rowOccupied(skull: Pick<Enemy, 'targetX' | 'targetY'>, enemies: readonly Enemy[], W: number, H: number): boolean {
  const z = [skullZone(skull, W, H)]
  return enemies.some((e) => !!e.path && pathHitsZone(e.path, W, H, z, e.pathMs))
}
