/** Every heart-costing arrival is telegraphed for at least 1 s of game time (playtest2-fixes R1.1, R1.3). */
import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'

vi.mock('../audio/index', () => ({ sfxLifeLost: vi.fn() }))

import { createInitialState, makeEnemy } from './state'
import type { GameState, Enemy } from './state'
import { stepSimulation } from './step'
import { TELEGRAPH_MIN_MS, TELEGRAPH_LEAD_MS, etaMs } from './enemies/telegraph'
import { spawnWave } from './enemies/waveSpawn'
import { createLunger } from './enemies/lunger'
import { spawnVariant } from './enemies/variantSpawn'
import { mulberry32 } from '../test/prng'

const W = 1280, H = 720

function base(enemies: Enemy[]): GameState {
  return {
    ...createInitialState(3), phase: 'playing', roundTimeMs: 50_000, lives: 3, enemies,
    spawnTimers: { ghost: 1e9, bat: 1e9, skull: 1e9, lunger: 1e9, pumpkin: 1e9 },
    waveIndex: 1e9, variantIndex: 1e9,
  }
}

/** One threatening enemy of the given kind, from the real spawners. */
function threat(kind: number, seed: number, speedMult: number): Enemy {
  const rand = mulberry32(seed)
  switch (kind) {
    case 0: return spawnWave('ghost', 'line', 1, { W, H, speedMult, rand })[0]
    case 1: return spawnWave('ghost', 'arc', 1, { W, H, speedMult, rand })[0]
    case 2: return spawnWave('pumpkin', 'drop', 1, { W, H, speedMult, rand })[0]
    case 3: return createLunger(W, H, speedMult)
    case 4: return spawnVariant('blink', W, H, [], rand)![0]
    case 5: return spawnVariant('mirror', W, H, [], rand)![0]
    default: {
      // A ghost that spawns right next to its target: it must still wait for its full telegraph.
      return makeEnemy({ id: 'near', type: 'ghost', x: W / 2 + 20, y: H / 2, targetX: W / 2, targetY: H / 2, speed: 0.5 * speedMult, hitbox: { x: 0, y: 0, w: 60, h: 60 } })
    }
  }
}

describe('telegraph before a heart is lost', () => {
  it('no threat costs a heart before its telegraph has been visible for TELEGRAPH_MIN_MS, at any frame rate', () => {
    expect(TELEGRAPH_MIN_MS).toBeGreaterThanOrEqual(1000)
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 6 }), fc.integer({ min: 1, max: 1e6 }), fc.double({ min: 0.5, max: 3, noNaN: true }),
      fc.array(fc.integer({ min: 4, max: 100 }), { minLength: 1, maxLength: 12 }),
      (kind, seed, speedMult, dts) => {
        const e = threat(kind, seed, speedMult)
        let s = base([e])
        let visibleMs = 0
        for (let i = 0; i < 4000 && s.lives === 3; i++) {
          const dt = dts[i % dts.length]
          const before = s.enemies.find((x) => x.id === e.id)
          s = stepSimulation(s, dt, W, H)
          const after = s.enemies.find((x) => x.id === e.id)
          if (after && after.warnMs > 0) visibleMs = after.warnMs
          if (s.lives < 3) {
            // the heart went this tick: the enemy was alarmed for the whole minimum before it
            expect(before).toBeDefined()
            expect(before!.warnMs + dt).toBeGreaterThanOrEqual(TELEGRAPH_MIN_MS)
            expect(visibleMs).toBeLessThanOrEqual(before!.warnMs + dt)
          }
        }
        expect(s.lives).toBe(2) // every threat does arrive eventually
      }), { numRuns: 250 })
  })

  it('a far threat is not alarmed; the alarm starts within the lead time', () => {
    const e = threat(0, 7, 1)
    expect(etaMs(e, W, H)).toBeGreaterThan(TELEGRAPH_LEAD_MS)
    const s = stepSimulation(base([e]), 16, W, H)
    expect(s.enemies[0].warnMs).toBe(0)
  })

  it('every arrival shows a MISSED call-out at its position, also inside the heart grace', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 3 }), fc.boolean(), (n, grace) => {
      const arrived = Array.from({ length: n }, (_, i) => makeEnemy({
        id: `a${i}`, type: 'ghost', x: 600 + i * 30, y: 360, targetX: 600 + i * 30, targetY: 360, speed: 0,
        hitbox: { x: 0, y: 0, w: 60, h: 60 }, warnMs: TELEGRAPH_MIN_MS,
      }))
      const s = stepSimulation({ ...base(arrived), invulnMs: grace ? 500 : 0 }, 16, W, H)
      const miss = s.callouts.filter((c) => c.kind === 'miss')
      expect(miss).toHaveLength(n)
      for (const c of miss) expect(c.text).toBe('MISSED')
      expect(s.lives).toBe(grace ? 3 : 2)
      expect(s.combo).toBe(1)
    }), { numRuns: 30 })
  })
})
