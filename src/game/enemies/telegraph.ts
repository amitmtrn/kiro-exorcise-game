/**
 * Telegraph before a heart is lost (playtest2-fixes R1.1). An arriving threat is "alarmed" once its remaining
 * travel time is at most TELEGRAPH_LEAD_MS; `warnMs` then adds up the game time (deltaMs) it has spent alarmed on
 * screen. `reach.ts` only lets it cost a heart once `warnMs >= TELEGRAPH_MIN_MS`, so the danger ring has been
 * visible for at least that long at any frame rate. An enemy that arrives early waits at its target, alarmed.
 */

import type { Enemy } from '../state'
import { pathDurationMs } from '../paths'
import { REACH_PX } from './variants'

export const TELEGRAPH_MIN_MS = 1000
/** Alarm lead: a little longer than the minimum, so an enemy on a normal path never has to wait. */
export const TELEGRAPH_LEAD_MS = 1400

/** Lunger constants (movement.ts): hold distance in canvas heights, windup, lunge speed multiplier. */
const LUNGER_HOLD_H = 0.185
const LUNGER_WINDUP_MS = 600
const LUNGE_MULT = 2.5

/** Estimated ms of travel left until the enemy reaches its target (0 once there). */
export function etaMs(e: Enemy, W: number, H: number): number {
  if (e.path) return Math.max(0, pathDurationMs(e.path, W, H) - e.pathMs)
  const pxPerMs = (e.speed * H) / 1000
  const dist = Math.hypot(e.targetX - e.x, e.targetY - e.y)
  if (pxPerMs <= 0) return dist <= REACH_PX ? 0 : Infinity
  if (e.type === 'lunger') {
    const lunge = Math.max(0, Math.min(dist, LUNGER_HOLD_H * H) - REACH_PX) / (pxPerMs * LUNGE_MULT)
    if (e.movePhase === 'lunge') return Math.max(0, dist - REACH_PX) / (pxPerMs * LUNGE_MULT)
    if (e.movePhase === 'windup') return Math.max(0, e.phaseTimer) + lunge
    return Math.max(0, dist - LUNGER_HOLD_H * H) / pxPerMs + LUNGER_WINDUP_MS + lunge
  }
  return Math.max(0, dist - REACH_PX) / pxPerMs
}

function onScreen(e: Enemy, W: number, H: number): boolean {
  return e.x >= 0 && e.x <= W && e.y >= 0 && e.y <= H
}

/** True once the enemy shows its telegraph (it never stops once started). */
export function isAlarmed(e: Enemy): boolean {
  return e.warnMs > 0
}

/** Adds `deltaMs` to `warnMs` while the enemy is on screen and alarmed (started, or within the lead time). */
export function tickWarn(e: Enemy, deltaMs: number, W: number, H: number): Enemy {
  if (!onScreen(e, W, H) || deltaMs <= 0) return e
  if (e.warnMs <= 0 && etaMs(e, W, H) > TELEGRAPH_LEAD_MS) return e
  return { ...e, warnMs: e.warnMs + deltaMs }
}

/** 0..1 telegraph progress (1 = complete: the enemy may now cost a heart). */
export function telegraphProgress(e: Enemy): number {
  return Math.min(1, Math.max(0, e.warnMs / TELEGRAPH_MIN_MS))
}

/** True when the telegraph has run its minimum. */
export function telegraphDone(e: Enemy): boolean {
  return e.warnMs >= TELEGRAPH_MIN_MS
}
