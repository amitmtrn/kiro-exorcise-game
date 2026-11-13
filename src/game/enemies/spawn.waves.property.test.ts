import { describe, it, expect, vi, afterEach } from 'vitest'
import fc from 'fast-check'
import { tickSpawners } from './spawn'
import { STAGES } from '../stages'
import { createInitialState } from '../state'
import type { GameState } from '../state'
import { withSeededRandom } from '../../test/prng'

const stageArb = fc.integer({ min: 1, max: 4 })
const seedArb = fc.integer({ min: 1, max: 1e6 })
const NEVER = 1e9

function playing(stage: number, elapsedMs = 0): GameState {
  const cfg = STAGES[stage - 1]
  return { ...createInitialState(stage), phase: 'playing', roundTimeMs: cfg.durationMs - elapsedMs }
}

describe('wave spawner — properties', () => {
  afterEach(() => vi.restoreAllMocks())

  it('cap and skull uniqueness hold with scripted events, intensity and path enemies', () => {
    fc.assert(fc.property(
      stageArb, seedArb,
      fc.array(fc.record({
        ms: fc.integer({ min: 1, max: 100 }),
        remove: fc.option(fc.nat({ max: 10 }), { nil: undefined }),
      }), { minLength: 1, maxLength: 1500 }),
      (stage, seed, ops) => {
        const cfg = STAGES[stage - 1]
        withSeededRandom(seed, () => {
          let s = playing(stage)
          let lastIndex = 0
          for (const op of ops) {
            s = tickSpawners(s, op.ms, 960, 540)
            s = { ...s, roundTimeMs: Math.max(0, s.roundTimeMs - op.ms * 40) } // fast-forward the stage clock
            if (op.remove !== undefined) s = { ...s, enemies: s.enemies.filter((_, i) => i !== op.remove) }
            expect(s.enemies.filter((e) => e.type !== 'boss' && !e.exiting).length).toBeLessThanOrEqual(cfg.maxEnemies)
            expect(s.enemies.filter((e) => e.type === 'skull' && !e.exiting).length).toBeLessThanOrEqual(1)
            expect(s.waveIndex).toBeGreaterThanOrEqual(lastIndex)
            expect(s.waveIndex).toBeLessThanOrEqual(cfg.waves!.events.length)
            lastIndex = s.waveIndex
            for (const e of s.enemies) {
              if (e.type === 'ghost' || e.type === 'bat' || e.type === 'pumpkin') expect(e.path).toBeDefined()
              if (e.type === 'bat') expect(['flyby']).toContain(e.path!.kind)
            }
          }
        })
      },
    ), { numRuns: 30 })
  })

  it('scripted events fire exactly once, in order, however the time is sliced', () => {
    fc.assert(fc.property(
      stageArb, seedArb, fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 20 }),
      (stage, seed, sliceSeeds) => {
        const cfg = STAGES[stage - 1]
        const events = cfg.waves!.events
        withSeededRandom(seed, () => {
          // Walk the stage clock to the end in uneven steps (events only: timers parked; steps <= 4 s, shorter than the gap between events, so the cap never truncates).
          let s: GameState = { ...playing(stage), spawnTimers: { ghost: NEVER, bat: NEVER, skull: NEVER, lunger: NEVER, pumpkin: NEVER } }
          let spawned = 0
          let i = 0
          while (s.roundTimeMs > 0) {
            const step = Math.min(s.roundTimeMs, 40 * sliceSeeds[i++ % sliceSeeds.length])
            const before = new Set(s.enemies.map((e) => e.id))
            s = tickSpawners(s, step, 960, 540)
            spawned += s.enemies.filter((e) => !before.has(e.id)).length
            s = { ...s, roundTimeMs: s.roundTimeMs - step, enemies: [] } // clear so the cap never truncates
          }
          // The loop spawns before it ticks the clock: one more tick at the very end.
          const before = new Set(s.enemies.map((e) => e.id))
          s = tickSpawners(s, 1, 960, 540)
          spawned += s.enemies.filter((e) => !before.has(e.id)).length
          expect(s.waveIndex).toBe(events.length)
          // Every event fires once; ghosts/bats/pumpkins enabled in the stage only.
          const mix = cfg.enemyMix
          const expected = events
            .filter((e) => (e.kind === 'ghost' && mix.ghost) || (e.kind === 'bat' && mix.bat) || (e.kind === 'pumpkin' && mix.pumpkin))
            .reduce((a, e) => a + Math.min(e.count, cfg.maxEnemies), 0)
          expect(spawned).toBe(expected)
        })
      },
    ), { numRuns: 30 })
  })

  it('spawn timers stay frame-rate independent in intensity-scaled time', () => {
    fc.assert(fc.property(stageArb, fc.integer({ min: 8, max: 100 }), fc.integer({ min: 8, max: 100 }), (stage, a, b) => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // fixed intervals: only the timer arithmetic is measured
      const count = (step: number) => (() => {
        let s = playing(stage, STAGES[stage - 1].durationMs * 0.5)
        s = { ...s, waveIndex: 99 }
        let n = 0
        for (let t = 0; t < 300_000; t += step) {
          const prev = s.spawnTimers
          s = tickSpawners({ ...s, enemies: [] }, step, 960, 540)
          if (s.spawnTimers.ghost > prev.ghost) n++
        }
        return n
      })()
      expect(Math.abs(count(a) - count(b))).toBeLessThanOrEqual(1)
    }), { numRuns: 15 })
  })
})
