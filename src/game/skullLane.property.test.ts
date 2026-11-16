/** playtest3-fixes R2: harmless targets never hide a skull, and a skull never hides among lanes. */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createSkull } from './enemies/skull'
import { spawnWave } from './enemies/waveSpawn'
import { tickSpawners } from './enemies/spawn'
import { skullClearancePx, skullZone, rowOccupied } from './skullLane'
import { pathDurationMs, pathPosition, WAVE_PATHS } from './paths'
import type { PathSpec } from './paths'
import type { WaveKind } from './waves'
import { createInitialState } from './state'
import type { Enemy, GameState } from './state'
import { STAGES } from './stages'
import { mulberry32, withSeededRandom } from '../test/prng'

/** Whole canvases and 2P halves (half the width, full height), small to ultra-wide. */
const sizes = fc.constantFrom<[number, number]>(
  [320, 360], [640, 360], [960, 540], [1280, 720], [1920, 906], [3024, 1364], [360, 640], [480, 540], [960, 906], [1512, 1364])
const seeds = fc.integer({ min: 1, max: 2 ** 31 - 1 })
const kinds = fc.constantFrom<WaveKind>('ghost', 'bat', 'pumpkin', 'candy')

/** Independent check: densest sampling (7 ms steps) of the whole path against the skull's lane rectangle. */
function minDistToLane(p: PathSpec, W: number, H: number, skull: Enemy, fromMs = 0): number {
  const z = skullZone(skull, W, H)
  const end = pathDurationMs(p, W, H)
  let best = Infinity
  for (let t = fromMs; t <= end + 7; t += 7) {
    const q = pathPosition(p, Math.min(t, end), W, H)
    const dx = Math.max(z.x - q.x, 0, q.x - (z.x + z.w)), dy = Math.max(z.y - q.y, 0, q.y - (z.y + z.h))
    best = Math.min(best, Math.hypot(dx, dy))
  }
  return best
}

describe('skull lane clearance (R2.1)', () => {
  it('the clearance is a hand radius plus a skull hitbox, up to 20 % of the height', () => {
    expect(skullClearancePx(906)).toBeGreaterThanOrEqual(50 + 67)
    expect(skullClearancePx(360)).toBeLessThanOrEqual(0.2 * 360)
  })

  it('a swarm or flyby spawned beside a skull never passes through its lane', () => {
    fc.assert(fc.property(sizes, seeds, kinds, fc.constantFrom(...WAVE_PATHS), fc.integer({ min: 1, max: 5 }),
      ([W, H], seed, kind, path, count) => {
        const skull = createSkull(W, H, 1, mulberry32(seed))
        const made = spawnWave(kind, path, count, { W, H, speedMult: 1, rand: mulberry32(seed + 1), avoid: [skullZone(skull, W, H)] })
        for (const e of made) expect(minDistToLane(e.path!, W, H, skull)).toBeGreaterThan(0)
      }), { numRuns: 400 })
  })

  it('unit: five swarm lanes crossing the skull row are removed or moved, never kept inside', () => {
    const W = 1920, H = 906
    const skull = createSkull(W, H, 1, () => 0.31) // left edge, low in the band
    const z = skullZone(skull, W, H)
    const made = spawnWave('bat', 'swarm', 5, { W, H, speedMult: 1, rand: mulberry32(7), height: (skull.targetY / H), avoid: [z] })
    for (const e of made) expect(minDistToLane(e.path!, W, H, skull)).toBeGreaterThan(0)
  })

  it('tickSpawners: every enemy that appears while a skull is active keeps clear of its lane, in whole areas and 2P halves', () => {
    fc.assert(fc.property(sizes, seeds, fc.integer({ min: 1, max: 6 }), ([W, H], seed, stage) => {
      withSeededRandom(seed, () => {
        const cfg = STAGES[stage - 1]
        if (!cfg.waves) return // boss stage: no random spawns
        const skull = createSkull(W, H, 1, mulberry32(seed))
        let s: GameState = { ...createInitialState(stage), phase: 'playing', roundTimeMs: cfg.durationMs, enemies: [skull] }
        const seen = new Set<string>([skull.id])
        for (let i = 0; i < 400; i++) {
          s = tickSpawners(s, 50, W, H)
          s = { ...s, roundTimeMs: Math.max(1, s.roundTimeMs - 150) } // run the stage clock through its scripted events
          // enemies leave after a while, so spawns keep coming; the skull stays
          if (i % 7 === 6) s = { ...s, enemies: s.enemies.filter((e) => e.type === 'skull') }
          for (const e of s.enemies) {
            if (seen.has(e.id)) continue
            seen.add(e.id)
            if (e.path && e.type !== 'skull') expect(minDistToLane(e.path, W, H, skull)).toBeGreaterThan(0)
          }
        }
      })
    }), { numRuns: 40 })
  })
})

describe('skull row choice (R2.2)', () => {
  const setup = (W: number, H: number, seed: number, stage: number, lanes: number): GameState => {
    const cfg = STAGES[stage - 1]
    const rand = mulberry32(seed)
    const on: Enemy[] = []
    for (let i = 0; i < lanes; i++) {
      on.push(...spawnWave(i % 2 ? 'bat' : 'ghost', rand() < 0.5 ? 'swarm' : 'flyby', 3, { W, H, speedMult: 0.5, rand }))
    }
    return {
      ...createInitialState(stage), phase: 'playing', roundTimeMs: cfg.durationMs, enemies: on,
      spawnTimers: { ghost: 1e9, bat: 1e9, skull: 0, lunger: 1e9, pumpkin: 1e9 },
    }
  }

  it('a skull never picks a row that an on-screen lane occupies', () => {
    fc.assert(fc.property(sizes, seeds, fc.integer({ min: 3, max: 4 }), fc.integer({ min: 0, max: 3 }), ([W, H], seed, stage, lanes) => {
      withSeededRandom(seed, () => {
        const before = setup(W, H, seed, stage, lanes)
        const after = tickSpawners(before, 16, W, H)
        const skull = after.enemies.find((e) => e.type === 'skull')
        if (!skull) return // no clear row: it waits
        for (const e of before.enemies) if (e.path) expect(minDistToLane(e.path, W, H, skull, e.pathMs)).toBeGreaterThan(0)
        expect(rowOccupied(skull, before.enemies, W, H)).toBe(false)
      })
    }), { numRuns: 200 })
  })

  it('unit: lanes covering every skull row keep the skull waiting', () => {
    const W = 1280, H = 720
    const lanes: Enemy[] = []
    for (const h of [0.35, 0.62]) {
      lanes.push(...spawnWave('bat', 'flyby', 1, { W, H, speedMult: 0.1, height: h, rand: () => 0.3 }))
    }
    const s: GameState = {
      ...createInitialState(3), phase: 'playing', roundTimeMs: STAGES[2].durationMs, enemies: lanes,
      spawnTimers: { ghost: 1e9, bat: 1e9, skull: 0, lunger: 1e9, pumpkin: 1e9 },
    }
    const after = tickSpawners({ ...s, enemies: lanes }, 16, W, H)
    expect(after.enemies.some((e) => e.type === 'skull')).toBe(false)
    expect(after.spawnTimers.skull).toBeLessThanOrEqual(0) // still due: retried next tick
  })
})
