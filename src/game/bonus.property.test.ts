import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { tickSpawners } from './enemies/spawn'
import { moveEnemies, cullExitedEnemies } from './enemies/movement'
import { splitReached } from './enemies/reach'
import { spawnWave } from './enemies/waveSpawn'
import { createInitialState, tickTimer, decrementLife } from './state'
import type { GameState } from './state'
import { BONUS_ROUND } from './waves'
import { withSeededRandom } from '../test/prng'

/** One tick of the playing loop, in loop.ts order (spawn → move → cull → reach → timer). */
function tick(s: GameState, ms: number, W: number, H: number): { state: GameState; missed: number } {
  s = tickSpawners(s, ms, W, H)
  s = { ...s, enemies: cullExitedEnemies(moveEnemies(s.enemies, ms, W, H), W, H) }
  const { survivors, missed } = splitReached(s.enemies, s.bonus)
  s = { ...s, enemies: survivors }
  for (let i = 0; i < missed; i++) s = decrementLife(s)
  return { state: tickTimer(s, ms), missed }
}

describe('bonus round — never costs a life (R5.3)', () => {
  it('a whole simulated round with arbitrary tick sizes, canvas sizes and swats', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 1e6 }),
      fc.integer({ min: 640, max: 1920 }), fc.integer({ min: 360, max: 1080 }),
      fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 60 }),
      fc.nat({ max: 9 }),
      (seed, W, H, deltaPattern, swatEvery) => {
        withSeededRandom(seed, () => {
          let s: GameState = {
            ...createInitialState(2),
            phase: 'playing',
            bonus: true,
            lives: 1, // even one life must survive
            roundTimeMs: BONUS_ROUND.durationMs,
            spawnTimers: { ghost: 99999, bat: BONUS_ROUND.spawnIntervalMs.bat, skull: 99999, lunger: 99999, pumpkin: BONUS_ROUND.spawnIntervalMs.pumpkin },
          }
          let n = 0
          let seenEnemies = 0
          while (s.phase === 'playing' && n < 20_000) {
            const ms = deltaPattern[n % deltaPattern.length]
            const r = tick(s, ms, W, H)
            expect(r.missed).toBe(0)
            s = r.state
            seenEnemies += s.enemies.length
            for (const e of s.enemies) {
              expect(e.harmless).toBe(true)
              expect(['candy', 'pumpkin']).toContain(e.type)
            }
            // The player swats something now and then; swatting must not matter either.
            if (swatEvery > 0 && n % (swatEvery + 3) === 0) s = { ...s, enemies: s.enemies.slice(1) }
            expect(s.lives).toBe(1)
            expect(s.phase).not.toBe('gameover')
            n++
          }
          expect(s.phase).toBe('summary')
          expect(seenEnemies).toBeGreaterThan(0)
        })
      },
    ), { numRuns: 20 })
  })

  it('even with threats sitting on their targets, the reach check ignores the bonus round', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 1, max: 1e6 }), (n, seed) => {
      const threats = withSeededRandom(seed, () => spawnWave('ghost', 'line', n, { W: 960, H: 540, speedMult: 1 }))
        .map((e) => ({ ...e, x: e.targetX, y: e.targetY }))
      expect(splitReached(threats, true)).toEqual({ survivors: threats, missed: 0 })
      expect(splitReached(threats, false).missed).toBe(n)
    }))
  })
})
