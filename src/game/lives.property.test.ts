/** Heart-loss invariants (playtest1-fixes R1.1, R1.2, R1.4, R1.5). */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createInitialState, makeEnemy, decrementLife, tickLifeTimers, LIFE_GRACE_MS, DEATH_MS } from './state'
import type { GameState, Enemy } from './state'
import { stepSimulation } from './step'

const W = 1280, H = 720
const base = (lives: number): GameState => ({ ...createInitialState(3), phase: 'playing', roundTimeMs: 40_000, lives })
const arrived = (id: number): Enemy => makeEnemy({
  id: `a${id}`, type: 'ghost', x: W / 2, y: H / 2, targetX: W / 2, targetY: H / 2, speed: 0,
  hitbox: { x: W / 2 - 30, y: H / 2 - 30, w: 60, h: 60 },
})

describe('life properties', () => {
  it('with more than one heart, no single tick (any number of arrivals) reaches gameover', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 3 }), fc.integer({ min: 0, max: 12 }), fc.integer({ min: 1, max: 100 }), (lives, n, ms) => {
      const s = stepSimulation({ ...base(lives), enemies: Array.from({ length: n }, (_, i) => arrived(i)) }, ms, W, H)
      expect(s.phase).toBe('playing')
      expect(lives - s.lives).toBeLessThanOrEqual(1)
    }), { numRuns: 200 })
  })

  it('hearts never drop by more than 1 inside any LIFE_GRACE_MS window', () => {
    const step = fc.record({ ms: fc.integer({ min: 1, max: 120 }), hits: fc.integer({ min: 0, max: 5 }) })
    fc.assert(fc.property(fc.array(step, { minLength: 1, maxLength: 120 }), (steps) => {
      let s = base(3)
      const history: Array<{ t: number; lives: number }> = [{ t: 0, lives: 3 }]
      let t = 0
      for (const { ms, hits } of steps) {
        if (s.phase === 'gameover') break
        s = tickLifeTimers(s, ms); t += ms
        for (let i = 0; i < hits; i++) s = decrementLife(s)
        history.push({ t, lives: s.lives })
      }
      for (const a of history) {
        const later = history.filter((b) => b.t >= a.t && b.t - a.t < LIFE_GRACE_MS)
        for (const b of later) expect(a.lives - b.lives).toBeLessThanOrEqual(1)
      }
    }), { numRuns: 300 })
  })

  it('every gameover reached by lives carries the full death transition', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 1500 }), { minLength: 1, maxLength: 40 }), (gaps) => {
      let s = base(3)
      for (const g of gaps) {
        s = tickLifeTimers(s, g)
        const next = decrementLife(s)
        if (next.phase === 'gameover' && s.phase !== 'gameover') expect(next.deathMs).toBe(DEATH_MS)
        s = next
      }
    }), { numRuns: 200 })
  })
})
