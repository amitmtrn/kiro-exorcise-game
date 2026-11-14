/**
 * Spawning of the new ghosts (more-content R1.5, R1.6, R1.10). Pure given a `rand`.
 * Spawn points keep a clearance from live skulls; wisp pairs sit side by side on one edge
 * inside the area (a seat's half in 2P), so a pair never spans the divider.
 */

import type { Enemy } from '../state'
import { makeEnemy } from '../state'
import { GHOST_SIZE } from './ghost'
import { SKULL_SIZE } from './skull'
import { hitboxFor } from './movement'
import { WISP_SIZE, initialState, speedFor } from './variants'
import type { VariantType } from './variants'

/** Spawn points stay this many skull hitbox widths away from a live skull (R1.6). */
export const SKULL_CLEARANCE_W = 2.5
export function skullClearancePx(): number { return SKULL_CLEARANCE_W * SKULL_SIZE * 1.2 }
/** Gap between the two wisps of a pair, px along the edge. */
export const PAIR_GAP_PX = WISP_SIZE * 1.4

export type Rand = () => number
export interface Pt { x: number; y: number }

function tail(rand: Rand): string { return Math.floor(rand() * 0xffffffff).toString(36).padStart(7, '0').slice(0, 8) }

/** An edge point (offset outside by the ghost size) at least the skull clearance from every skull, or null. */
export function pickSpawn(W: number, H: number, skulls: readonly Pick<Enemy, 'x' | 'y'>[], rand: Rand = Math.random): Pt | null {
  const order = [0, 1, 2, 3]
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  const m = GHOST_SIZE
  const clear = skullClearancePx()
  for (const edge of order) {
    for (let tryN = 0; tryN < 6; tryN++) {
      // keep wisp pairs (±gap) and bodies inside the area along the edge
      const f = 0.15 + 0.7 * rand()
      const p: Pt = edge === 0 ? { x: f * W, y: -m } : edge === 1 ? { x: W + m, y: f * H } : edge === 2 ? { x: f * W, y: H + m } : { x: -m, y: f * H }
      if (skulls.every((s) => Math.hypot(s.x - p.x, s.y - p.y) >= clear)) return p
    }
  }
  return null
}

function make(type: VariantType, p: Pt, W: number, H: number, rand: Rand, pairId?: string): Enemy {
  const tx = W / 2, ty = H / 2
  return makeEnemy({
    id: tail(rand),
    type,
    x: p.x, y: p.y,
    targetX: tx, targetY: ty,
    speed: speedFor(type, Math.hypot(tx - p.x, ty - p.y), H),
    sineOffset: rand() * Math.PI * 2,
    hitbox: hitboxFor(type, p.x, p.y),
    spawnedAt: performance.now(),
    vState: initialState(type),
    pairId,
  })
}

/** One wisp pair: both on the same edge, side by side along it. */
export function createWispPair(p: Pt, W: number, H: number, rand: Rand = Math.random): Enemy[] {
  const pairId = tail(rand)
  const alongY = p.x < 0 || p.x > W
  const half = PAIR_GAP_PX / 2
  const a: Pt = alongY ? { x: p.x, y: p.y - half } : { x: p.x - half, y: p.y }
  const b: Pt = alongY ? { x: p.x, y: p.y + half } : { x: p.x + half, y: p.y }
  return [make('wisp', a, W, H, rand, pairId), make('wisp', b, W, H, rand, pairId)]
}

export function createMirror(p: Pt, W: number, H: number, rand: Rand = Math.random): Enemy { return make('mirror', p, W, H, rand) }
export function createBlink(p: Pt, W: number, H: number, rand: Rand = Math.random): Enemy { return make('blink', p, W, H, rand) }

/** The enemies of one spawn of `kind` at the area `W` × `H`, or null when no safe edge point exists (retry next tick). */
export function spawnVariant(kind: VariantType, W: number, H: number, skulls: readonly Pick<Enemy, 'x' | 'y'>[], rand: Rand = Math.random): Enemy[] | null {
  const p = pickSpawn(W, H, skulls, rand)
  if (!p) return null
  if (kind === 'wisp') return createWispPair(p, W, H, rand)
  return [kind === 'mirror' ? createMirror(p, W, H, rand) : createBlink(p, W, H, rand)]
}

/** One finale minion `kind` at the boss position (`bx`, `by`), aimed at the exact centre. A wisp makes a pair. */
export function spawnVariantAt(kind: VariantType, bx: number, by: number, W: number, H: number, rand: Rand = Math.random): Enemy[] {
  const p: Pt = { x: bx, y: by }
  if (kind === 'wisp') return createWispPair(p, W, H, rand)
  return [kind === 'mirror' ? createMirror(p, W, H, rand) : createBlink(p, W, H, rand)]
}
