/**
 * Builds path-following enemies for the wave spawner (waves spec).
 */

import type { Enemy, EnemyType } from '../state'
import { makeEnemy } from '../state'
import type { WavePath, PathSpec, Edges, Rand } from '../paths'
import { makePath, makeSwarm, pathPosition, pathEnd } from '../paths'
import type { WaveKind } from '../waves'
import { GHOST_SPEED } from './ghost'
import { BAT_SPEED } from './bat'
import { PUMPKIN_SPEED } from './pumpkin'
import { CANDY_SPEED } from './candy'
import { hitboxFor } from './movement'
import { randomId } from './spawnUtils'
import type { Rect } from '../zones'
import { pathHitsZone } from '../skullLane'

const BASE_SPEED: Record<WaveKind, number> = {
  ghost: GHOST_SPEED,
  bat: BAT_SPEED,
  pumpkin: PUMPKIN_SPEED,
  candy: CANDY_SPEED,
}

export interface SpawnOptions {
  W: number
  H: number
  /** Stage speed multiplier × intensity speed factor. */
  speedMult: number
  edges?: Edges
  /** Bonus round: everything harmless, pumpkins need one hit, drops fall through. */
  bonus?: boolean
  /** Single flyby height (fraction of H). */
  height?: number
  rand?: Rand
  /** Skull zones (playtest3-fixes R2.1): no spawned path may pass through one. */
  avoid?: readonly Rect[]
}

/** Attempts to place a wave clear of the skull zones; the last half give up a fixed scripted height. */
export const AVOID_ATTEMPTS = 8

/** Flyby row heights: `count` evenly spread bands between 0.18 and 0.78 of the canvas height. */
export function rowHeights(count: number): number[] {
  if (count === 1) return [0.45]
  return Array.from({ length: count }, (_, i) => 0.18 + (0.6 * i) / (count - 1))
}

function enemyOnPath(kind: WaveKind, path: PathSpec, o: SpawnOptions): Enemy {
  const type: EnemyType = kind
  const start = pathPosition(path, 0, o.W, o.H)
  const end = pathEnd(path, o.W, o.H)
  const rand = o.rand ?? Math.random
  return makeEnemy({
    id: randomId(),
    type,
    x: start.x, y: start.y,
    targetX: end.x, targetY: end.y,
    speed: path.speed,
    sineOffset: rand() * Math.PI * 2,
    hitbox: hitboxFor(type, start.x, start.y),
    spawnedAt: performance.now(),
    hitCount: 0,
    path,
    pathMs: 0,
    harmless: kind === 'candy' || kind === 'bat' || !!o.bonus,
    hitsNeeded: kind === 'pumpkin' && !o.bonus ? 2 : 1,
  })
}

/**
 * Spawns `count` enemies of `kind` on `path`. `swarm` is one cluster of
 * `count` members; `flyby` with count > 1 is a row at several heights.
 */
export function spawnWave(kind: WaveKind, path: WavePath, count: number, o: SpawnOptions): Enemy[] {
  const zones = o.avoid
  if (!zones || zones.length === 0) return spawnWaveRaw(kind, path, count, o)
  // Re-roll until every member is clear; otherwise keep the attempt with the most clear members (thinned),
  // possibly none (the caller waits for the skull to leave).
  let best: Enemy[] = []
  for (let i = 0; i < AVOID_ATTEMPTS; i++) {
    const made = spawnWaveRaw(kind, path, count, { ...o, avoid: undefined, height: i < AVOID_ATTEMPTS / 2 ? o.height : undefined })
    const clear = made.filter((e) => !e.path || !pathHitsZone(e.path, o.W, o.H, zones))
    if (clear.length === made.length) return made
    if (clear.length > best.length) best = clear
  }
  return best
}

function spawnWaveRaw(kind: WaveKind, path: WavePath, count: number, o: SpawnOptions): Enemy[] {
  // Left / right-only stages never enter from the top (R3.3): a drop becomes a flyby.
  if (path === 'drop' && o.edges === 'leftRight') path = 'flyby'
  const rand = o.rand ?? Math.random
  const speed = BASE_SPEED[kind] * o.speedMult
  const base = { W: o.W, H: o.H, speed, rand, edges: o.edges, through: !!o.bonus }

  if (path === 'swarm') {
    return makeSwarm(count, { ...base, height: o.height }).map((p) => enemyOnPath(kind, p, o))
  }

  if (path === 'flyby' && count > 1) {
    const dir0 = rand() < 0.5 ? 'ltr' : 'rtl'
    return rowHeights(count).map((height, i) =>
      enemyOnPath(kind, makePath('flyby', { ...base, height, dir: (i % 2 === 0) === (dir0 === 'ltr') ? 'ltr' : 'rtl' }), o))
  }

  return Array.from({ length: count }, () =>
    enemyOnPath(kind, makePath(path, { ...base, height: o.height }), o))
}
