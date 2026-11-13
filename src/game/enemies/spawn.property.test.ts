import { describe, it, expect, vi, afterEach } from 'vitest'
import fc from 'fast-check'
import { tickSpawners } from './spawn'
import { moveEnemies } from './movement'
import { STAGES } from '../stages'
import { createInitialState, makeEnemy } from '../state'
import type { Enemy, EnemyType, GameState } from '../state'
import { withSeededRandom } from '../../test/prng'

type Op =
  | { k: 'tick'; ms: number }
  | { k: 'move'; ms: number }
  | { k: 'remove'; index: number }

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ k: fc.constant('tick' as const), ms: fc.integer({ min: 1, max: 5000 }) }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('move' as const), ms: fc.integer({ min: 1, max: 100 }) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('remove' as const), index: fc.nat({ max: 20 }) }) },
)

/** Loop-like deltas: the real loop clamps each frame to ≤ 100 ms. */
const loopOpArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ k: fc.constant('tick' as const), ms: fc.integer({ min: 1, max: 100 }) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('remove' as const), index: fc.nat({ max: 20 }) }) },
)

const countable = (enemies: Enemy[]) => enemies.filter((e) => e.type !== 'boss' && !e.exiting).length
const skullsActive = (enemies: Enemy[]) => enemies.filter((e) => e.type === 'skull' && !e.exiting).length

function filler(i: number, type: EnemyType = 'ghost'): Enemy {
  return makeEnemy({
    id: `pre${i}`, type, x: -40, y: 100 + i, targetX: 960, targetY: 540, speed: 0.1,
    hitbox: { x: -60, y: 80 + i, w: 40, h: 40 },
  })
}

function run(
  stage: number, preexisting: number, ops: Op[], seed: number, w: number, h: number,
  check: (s: GameState, before: GameState) => void,
  skulls: Array<'active' | 'exiting'> = [],
): void {
  const cfg = STAGES[stage - 1]
  withSeededRandom(seed, () => {
    let s: GameState = {
      ...createInitialState(stage),
      phase: 'playing',
      enemies: [
        ...Array.from({ length: Math.min(preexisting, cfg.maxEnemies) }, (_, i) => filler(i)),
        ...skulls.map((k, i) => ({ ...filler(100 + i, 'skull'), exiting: k === 'exiting' })),
      ],
    }
    for (const op of ops) {
      const before = s
      if (op.k === 'tick') s = tickSpawners(s, op.ms, w, h)
      else if (op.k === 'move') s = { ...s, enemies: moveEnemies(s.enemies, op.ms, w, h) }
      else s = { ...s, enemies: s.enemies.filter((_, i) => i !== op.index) }
      check(s, before)
    }
  })
}

const common = {
  stage: fc.integer({ min: 1, max: 5 }),
  preexisting: fc.integer({ min: 0, max: 6 }),
  seed: fc.integer(),
  w: fc.integer({ min: 320, max: 3840 }),
  h: fc.integer({ min: 240, max: 2160 }),
}

describe('spawner (properties)', () => {
  it('never exceeds the stage enemy cap, even when several timers expire on one tick', () => {
    fc.assert(fc.property(
      common.stage, common.preexisting, fc.array(opArb, { maxLength: 40 }), common.seed, common.w, common.h,
      (stage, pre, ops, seed, w, h) => {
        const max = STAGES[stage - 1].maxEnemies
        run(stage, pre, ops, seed, w, h, (s) => {
          expect(countable(s.enemies)).toBeLessThanOrEqual(max)
        })
      },
    ))
  })

  it('never exceeds the cap with real-loop frame deltas (≤ 100 ms) either', () => {
    fc.assert(fc.property(
      common.stage, common.preexisting, fc.array(loopOpArb, { minLength: 50, maxLength: 400 }),
      common.seed, common.w, common.h,
      (stage, pre, ops, seed, w, h) => {
        const max = STAGES[stage - 1].maxEnemies
        run(stage, pre, ops, seed, w, h, (s) => {
          expect(countable(s.enemies)).toBeLessThanOrEqual(max)
        })
      },
    ))
  })

  it('at most one non-exiting skull, and only enemy types in the stage mix', () => {
    fc.assert(fc.property(
      common.stage, common.preexisting, fc.array(opArb, { maxLength: 40 }), common.seed, common.w, common.h,
      (stage, pre, ops, seed, w, h) => {
        const mix = STAGES[stage - 1].enemyMix
        run(stage, pre, ops, seed, w, h, (s) => {
          expect(skullsActive(s.enemies)).toBeLessThanOrEqual(1)
          for (const e of s.enemies) {
            if (e.id.startsWith('pre')) continue
            expect(mix[e.type]).toBe(true)
          }
        })
      },
    ))
  })

  it('at most one non-exiting skull when skulls (active and exiting) already exist', () => {
    const skullState = fc.constantFrom<Array<'active' | 'exiting'>>(
      [], ['active'], ['exiting'], ['exiting', 'active'], ['exiting', 'exiting'],
    )
    fc.assert(fc.property(
      fc.integer({ min: 3, max: 5 }), skullState, fc.array(opArb, { maxLength: 40 }), common.seed, common.w, common.h,
      (stage, skulls, ops, seed, w, h) => {
        run(stage, 0, ops, seed, w, h, (s) => {
          expect(skullsActive(s.enemies)).toBeLessThanOrEqual(1)
        }, skulls)
      },
    ))
  })

  it('a leaving (exiting) skull does not block a new skull', () => {
    withSeededRandom(3, () => {
      const stage = STAGES.findIndex((c) => c.enemyMix.skull) + 1
      const base = createInitialState(stage)
      const s: GameState = {
        ...base, phase: 'playing',
        enemies: [{ ...filler(0, 'skull'), exiting: true }],
        spawnTimers: { ...base.spawnTimers, skull: 1 },
      }
      const next = tickSpawners(s, 50, 1920, 1080)
      expect(skullsActive(next.enemies)).toBe(1)
    })
  })

  it('never spawns outside the playing phase', () => {
    fc.assert(fc.property(
      common.stage, fc.constantFrom('start', 'stageTitle', 'summary', 'gameover' as const),
      fc.integer({ min: 1, max: 20_000 }), common.seed,
      (stage, phase, ms, seed) => {
        withSeededRandom(seed, () => {
          const s = { ...createInitialState(stage), phase }
          const next = tickSpawners(s, ms, 1920, 1080)
          expect(next.enemies).toHaveLength(0)
          expect(next).toBe(s)
        })
      },
    ))
  })

  it('spawn timers stay finite and non-negative after a tick', () => {
    fc.assert(fc.property(
      common.stage, fc.integer({ min: 1, max: 20_000 }), common.seed,
      (stage, ms, seed) => {
        withSeededRandom(seed, () => {
          const s = tickSpawners({ ...createInitialState(stage), phase: 'playing' }, ms, 1920, 1080)
          for (const t of Object.values(s.spawnTimers)) {
            expect(Number.isFinite(t)).toBe(true)
            expect(t).toBeGreaterThanOrEqual(0)
          }
        })
      },
    ))
  })
})

describe('spawner cap regression (found by the cap property)', () => {
  it('two timers expiring on one tick cannot overshoot a nearly-full stage 2', () => {
    // Stage 2: cap 5, ghost + bat. 4 enemies present, both timers expire at once.
    withSeededRandom(1, () => {
      const base = createInitialState(2)
      const s: GameState = {
        ...base,
        phase: 'playing',
        enemies: [0, 1, 2, 3].map((i) => filler(i)),
        spawnTimers: { ...base.spawnTimers, ghost: 10, bat: 10 },
      }
      const next = tickSpawners(s, 50, 1920, 1080)
      expect(countable(next.enemies)).toBe(STAGES[1].maxEnemies)
    })
  })
})

describe('spawn rate independent of frame rate (BUG-5)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  /** Counts timer resets (the timer jumps up) over `totalMs` at a fixed step. */
  function resets(stage: number, stepMs: number, totalMs: number): number {
    const base = createInitialState(stage)
    let s: GameState = { ...base, phase: 'playing' }
    let n = 0
    for (let t = 0; t < totalMs; t += stepMs) {
      const before = s.spawnTimers.ghost
      s = tickSpawners(s, stepMs, 1920, 1080)
      // keep the cap out of the way: only the timer matters here
      s = { ...s, enemies: [] }
      if (s.spawnTimers.ghost > before) n++
    }
    return n
  }

  it('the number of ghost timer expiries over a long run is the same at any step size', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 5 }), fc.integer({ min: 8, max: 100 }), fc.integer({ min: 8, max: 100 }),
      (stage, stepA, stepB) => {
        const total = 600_000
        expect(Math.abs(resets(stage, stepA, total) - resets(stage, stepB, total))).toBeLessThanOrEqual(1)
      },
    ), { numRuns: 25 })
  })

  it('carries the overshoot into the next interval', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const base = createInitialState(2)
    const s = tickSpawners({ ...base, phase: 'playing', spawnTimers: { ...base.spawnTimers, ghost: 10 } }, 60, 1920, 1080)
    const interval = STAGES[1].spawnIntervalMs.ghost * (0.8 + 0.5 * 0.5)
    expect(s.spawnTimers.ghost).toBeCloseTo(interval - 50, 6)
  })
})
