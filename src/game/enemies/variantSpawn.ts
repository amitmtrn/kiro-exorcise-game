/**
 * Spawning of the new ghosts (more-content R1.5, R1.6, R1.10). Pure given a `rand`.
 * Spawn points keep a clearance from live skulls; wisp pairs sit side by side on one edge
 * inside the area (a seat's half in 2P), so a pair never spans the divider.
 */

import type { Enemy } from '../state'
import { makeEnemy } from '../state'
import { GHOST_SIZE } from './ghost'
import { SKULL_SIZE } from './skull'
import { BOSS_SIZE } from './boss'
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
export function pickSpawn(W: number, H: number, skulls: readonly Pick<Enemy, 'x' | 'y'>[], rand: Rand = Math.random, span = 0): Pt | null {
  const order = [0, 1, 2, 3]
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  const m = GHOST_SIZE
  const clear = skullClearancePx()
  for (const edge of order) {
    for (let tryN = 0; tryN < 6; tryN++) {
      // keep wisp pairs (±gap) and bodies inside the area along the edge
      const f = 0.15 + 0.7 * rand()
      const p: Pt = edge === 0 ? { x: f * W, y: -m } : edge === 1 ? { x: W + m, y: f * H } : edge === 2 ? { x: f * W, y: H + m } : { x: -m, y: f * H }
      // `span`: a wisp pair sits ±span along the edge; every member must clear the skulls, not just the midpoint
      const alongY = edge === 1 || edge === 3
      const pts: Pt[] = span > 0
        ? [p, alongY ? { x: p.x, y: p.y - span } : { x: p.x - span, y: p.y }, alongY ? { x: p.x, y: p.y + span } : { x: p.x + span, y: p.y }]
        : [p]
      if (skulls.every((s) => pts.every((q) => Math.hypot(s.x - q.x, s.y - q.y) >= clear))) return p
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
  const p = pickSpawn(W, H, skulls, rand, kind === 'wisp' ? PAIR_GAP_PX / 2 : 0)
  if (!p) return null
  if (kind === 'wisp') return createWispPair(p, W, H, rand)
  return [kind === 'mirror' ? createMirror(p, W, H, rand) : createBlink(p, W, H, rand)]
}

/** Keep a king-summoned wisp pair, bodies included, inside [0, W] (R1.10): clamp the midpoint, or stack the pair when it cannot fit. */
function createKingWispPair(p: Pt, W: number, H: number, rand: Rand): Enemy[] {
  const half = PAIR_GAP_PX / 2
  const r = WISP_SIZE / 2
  if (W >= 2 * (half + r)) return createWispPair({ x: Math.min(Math.max(p.x, half + r), W - half - r), y: p.y }, W, H, rand)
  const pairId = tail(rand)
  const x = W >= 2 * r ? Math.min(Math.max(p.x, r), W - r) : W / 2
  return [make('wisp', { x, y: p.y - half }, W, H, rand, pairId), make('wisp', { x, y: p.y + half }, W, H, rand, pairId)]
}

/** A minion starts this far beside the boss centre, so it clears the boss sprite even on a small canvas. */
export const KING_MINION_OFFSET_PX = BOSS_SIZE * 1.1

/** True when a live skull is within the spawn clearance of (`x`, `y`) (R1.6). */
export function skullNear(skulls: readonly Pick<Enemy, 'x' | 'y'>[], x: number, y: number): boolean {
  const clear = skullClearancePx()
  return skulls.some((s) => Math.hypot(s.x - x, s.y - y) < clear)
}

/** Where the king's minions appear: beside the boss, on the side facing the centre column. */
export function kingSpawnPoint(bx: number, by: number, W: number): Pt {
  const side = bx <= W / 2 ? 1 : -1
  return { x: Math.min(Math.max(bx + side * KING_MINION_OFFSET_PX, 0.1 * W), 0.9 * W), y: by }
}

/**
 * One finale minion `kind` beside the boss (`bx`, `by`), on the side facing the centre column, aimed at the
 * exact centre. A wisp makes a pair.
 */
export function spawnVariantAt(kind: VariantType, bx: number, by: number, W: number, H: number, rand: Rand = Math.random): Enemy[] {
  const p = kingSpawnPoint(bx, by, W)
  if (kind === 'wisp') return createKingWispPair(p, W, H, rand)
  return [kind === 'mirror' ? createMirror(p, W, H, rand) : createBlink(p, W, H, rand)]
}
