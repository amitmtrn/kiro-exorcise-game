/**
 * Wave scripts (waves spec) — plain data plus a few pure helpers.
 * Changing a number here never requires touching game logic.
 */

import type { WavePath } from './paths'
import type { EnemyMix } from './stages'

export type WaveKind = 'ghost' | 'bat' | 'pumpkin' | 'candy'

/** A scripted set piece, fired once when the stage clock reaches `atMs`. */
export interface WaveEvent {
  atMs: number
  kind: WaveKind
  path: WavePath
  /** Enemies to spawn; for `swarm` the cluster size, for `flyby` a row at several heights. */
  count: number
  /** flyby height as a fraction of the canvas height (single flyby only). */
  height?: number
}

/** Piecewise-linear difficulty level over stage progress. */
export interface IntensityCurve {
  /** [progress 0–1, level 0–1], sorted by progress. */
  points: Array<[number, number]>
  /** Progress at which the curve peaks; non-decreasing before it. */
  peakAt: number
}

export type PathMix = Partial<Record<WaveKind, Partial<Record<WavePath, number>>>>

export interface WaveScript {
  intensity: IntensityCurve
  pathMix: PathMix
  events: WaveEvent[]
}

/** Scripts for stages 1–4, keyed by stage id. Stage 5 (boss) has none. */
export const STAGE_SCRIPTS: Record<number, WaveScript> = {
  1: {
    intensity: { points: [[0, 0.15], [0.75, 0.6], [1, 0.5]], peakAt: 0.75 },
    pathMix: { ghost: { line: 3, arc: 2, flyby: 1 } },
    events: [
      { atMs: 12_000, kind: 'ghost', path: 'arc', count: 1 },
      { atMs: 24_000, kind: 'ghost', path: 'flyby', count: 2 },
      { atMs: 34_000, kind: 'ghost', path: 'line', count: 2 },
    ],
  },
  2: {
    intensity: { points: [[0, 0.2], [0.8, 0.7], [1, 0.6]], peakAt: 0.8 },
    pathMix: {
      ghost: { line: 2, arc: 2, drop: 2, flyby: 1 },
      bat: { flyby: 3, swarm: 2 },
    },
    events: [
      { atMs: 10_000, kind: 'bat', path: 'swarm', count: 3 },
      { atMs: 20_000, kind: 'bat', path: 'flyby', count: 3 },
      { atMs: 32_000, kind: 'ghost', path: 'drop', count: 2 },
      { atMs: 42_000, kind: 'bat', path: 'swarm', count: 4 },
    ],
  },
  3: {
    intensity: { points: [[0, 0.25], [0.85, 0.85], [1, 0.75]], peakAt: 0.85 },
    pathMix: {
      ghost: { line: 2, arc: 2, drop: 2, flyby: 1 },
      bat: { flyby: 3, swarm: 3 },
    },
    events: [
      { atMs: 8_000, kind: 'bat', path: 'swarm', count: 4 },
      { atMs: 18_000, kind: 'ghost', path: 'flyby', count: 3 },
      { atMs: 30_000, kind: 'ghost', path: 'drop', count: 2 },
      { atMs: 42_000, kind: 'bat', path: 'swarm', count: 5 },
    ],
  },
  4: {
    intensity: { points: [[0, 0.3], [0.85, 1], [1, 0.9]], peakAt: 0.85 },
    pathMix: {
      ghost: { line: 2, arc: 2, drop: 2, flyby: 1 },
      bat: { flyby: 3, swarm: 3 },
      pumpkin: { drop: 2, arc: 2, line: 1 },
    },
    events: [
      { atMs: 8_000, kind: 'bat', path: 'swarm', count: 4 },
      { atMs: 18_000, kind: 'pumpkin', path: 'drop', count: 2 },
      { atMs: 28_000, kind: 'ghost', path: 'flyby', count: 3 },
      { atMs: 38_000, kind: 'bat', path: 'swarm', count: 5 },
      { atMs: 46_000, kind: 'ghost', path: 'drop', count: 2 },
    ],
  },
}

// ─── Bonus round ─────────────────────────────────────────────────────────────

export interface BonusRound {
  name: string
  subtitle: string
  durationMs: number
  /**
   * Same shape as a stage's config: the `bat` slot spawns candy and the
   * `pumpkin` slot spawns one-hit pumpkins; the other slots are unused.
   */
  spawnIntervalMs: { ghost: number; bat: number; skull: number; lunger: number; pumpkin: number }
  enemyMix: EnemyMix
  speedMultiplier: number
  maxEnemies: number
  script: WaveScript
}

export const BONUS_ROUND: BonusRound = {
  name: 'Bonus Round',
  subtitle: 'Candy Storm',
  durationMs: 15_000,
  spawnIntervalMs: { ghost: 99999, bat: 450, skull: 99999, lunger: 99999, pumpkin: 2200 },
  enemyMix: { ghost: false, bat: true, skull: false, lunger: false, pumpkin: true, boss: false },
  speedMultiplier: 1.0,
  maxEnemies: 8,
  script: {
    intensity: { points: [[0, 0.3], [0.8, 1], [1, 0.9]], peakAt: 0.8 },
    pathMix: {
      candy: { drop: 3, flyby: 2, swarm: 1 },
      pumpkin: { flyby: 2, drop: 1 },
    },
    events: [
      { atMs: 3_000, kind: 'candy', path: 'swarm', count: 5 },
      { atMs: 8_000, kind: 'candy', path: 'flyby', count: 4 },
      { atMs: 12_000, kind: 'pumpkin', path: 'flyby', count: 2 },
    ],
  },
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Intensity level (0–1) at stage progress `t` (clamped to 0–1). */
export function intensityAt(curve: IntensityCurve, t: number): number {
  const pts = curve.points
  const x = Math.min(1, Math.max(0, t))
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    if (x <= x1) {
      const [x0, y0] = pts[i - 1]
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return pts[pts.length - 1][1]
}

/** Spawn-timer rate multiplier for an intensity level (R4.2). */
export function spawnRateFor(level: number): number {
  return 0.6 + 0.9 * level
}

/** Speed factor for newly spawned enemies at an intensity level (R4.2). */
export function speedFactorFor(level: number): number {
  return 0.85 + 0.3 * level
}

/** Weighted pick from a path mix; `rand` ∈ [0, 1). Falls back to `line` for an empty mix. */
export function pickPath(mix: Partial<Record<WavePath, number>> | undefined, rand: number): WavePath {
  const entries = Object.entries(mix ?? {}).filter(([, w]) => (w ?? 0) > 0) as Array<[WavePath, number]>
  const total = entries.reduce((a, [, w]) => a + w, 0)
  if (total === 0) return 'line'
  let r = rand * total
  for (const [path, w] of entries) {
    if (r < w) return path
    r -= w
  }
  return entries[entries.length - 1][0]
}
