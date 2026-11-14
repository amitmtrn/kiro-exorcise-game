import type { Enemy } from '../state'
import { makeEnemy } from '../state'
import { randomId } from './spawnUtils'
import { bodyZone, hudRects } from '../zones'

export const SKULL_SIZE = 56
/** Hitbox scale used by `hitboxFor` (kept in step with movement.ts). */
const HITBOX_SCALE = 1.2
/** feel-fix R2: a skull leaves after this long on screen. */
export const SKULL_ON_SCREEN_MS = 4000
/** Speed multiplier while leaving. */
export const SKULL_EXIT_SPEED_MULT = 1.5
export const SKULL_SPEED = 0.148 // canvas heights per second
/**
 * playtest2-fixes R3.3: touching a new skull costs nothing for this long once its whole hitbox is on screen
 * (at least the 800 ms the operator asked for).
 */
export const SKULL_GRACE_MS = 1000
/** Gap between the hitbox and the body zone / HUD rows, px. */
const GAP_PX = 4

/**
 * Where a skull comes from and where it hovers (playtest2-fixes R2, R3): it enters from the left or right edge
 * at a height between the top and bottom HUD rows and flies a horizontal line to a point beside the body zone.
 * Never the top or bottom edge, never the body column, never a HUD corner. Pure given `rand`.
 */
export function skullPlacement(W: number, H: number, rand: () => number = Math.random): { x: number; y: number; tx: number; ty: number } {
  const half = SKULL_SIZE * HITBOX_SCALE / 2
  const body = bodyZone(W, H)
  const hudH = Math.max(...hudRects(W, H).map((r) => r.h))
  const yLo = Math.max(0.25 * H, hudH + half + GAP_PX)
  const yHi = Math.min(0.65 * H, H - hudH - half - GAP_PX)
  const y = yLo <= yHi ? yLo + rand() * (yHi - yLo) : H / 2
  const left = rand() < 0.5
  // Hover x: between the screen edge and the body column, hitbox included.
  const lo = half + GAP_PX
  const hi = Math.max(lo, body.x - half - GAP_PX)
  const hoverLeft = lo + rand() * (hi - lo)
  const tx = left ? hoverLeft : W - hoverLeft
  return { x: left ? -SKULL_SIZE : W + SKULL_SIZE, y, tx, ty: y }
}

export function createSkull(canvasW: number, canvasH: number, speedMult = 1, rand: () => number = Math.random): Enemy {
  const { x, y, tx, ty } = skullPlacement(canvasW, canvasH, rand)
  const w = SKULL_SIZE * HITBOX_SCALE
  return makeEnemy({
    id: randomId(),
    type: 'skull',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: SKULL_SPEED * speedMult,
    sineOffset: rand() * Math.PI * 2,
    hitbox: { x: x - w / 2, y: y - w / 2, w, h: w },
    spawnedAt: performance.now(),
    hitCount: 0,
    graceMs: SKULL_GRACE_MS,
  })
}
