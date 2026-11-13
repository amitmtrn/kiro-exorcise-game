import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { bossPhaseFor, onBossHit, moveBoss, isBossVulnerable, PHASE_PARAMS } from './bossPhases'
import { createBoss } from './boss'
import type { Enemy } from '../state'

const W = 1920
const H = 1080

describe('boss phases (properties)', () => {
  it('phase is monotone in hits taken and steps by at most one', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 40 }), (needed) => {
      let prev = bossPhaseFor(0, needed)
      expect(prev).toBe(1)
      for (let h = 1; h <= needed; h++) {
        const p = bossPhaseFor(h, needed)
        expect(p).toBeGreaterThanOrEqual(prev)
        expect(p - prev).toBeLessThanOrEqual(1)
        prev = p
      }
      expect(prev).toBe(3)
    }))
  })

  it('under any hit/time sequence the stored phase matches health and the boss dies exactly at hitsNeeded', () => {
    const stepArb = fc.oneof(
      fc.constant<'hit'>('hit'),
      fc.integer({ min: 1, max: 800 }),
    )
    fc.assert(fc.property(fc.array(stepArb, { maxLength: 80 }), (steps) => {
      let b: Enemy = createBoss(W, H)
      for (const step of steps) {
        if (step === 'hit') {
          if (!isBossVulnerable(b)) continue
          const r = onBossHit(b)
          b = r.boss
          expect(r.defeated).toBe(b.bossHitsReceived >= b.hitsNeeded)
          if (r.defeated) break
        } else {
          b = moveBoss(b, step, W, H)
        }
        expect(b.bossPhase).toBe(bossPhaseFor(b.bossHitsReceived, b.hitsNeeded))
        expect(b.x).toBeGreaterThanOrEqual(-1)
        expect(b.x).toBeLessThanOrEqual(W + 1)
        expect(b.y).toBeLessThanOrEqual(H)
      }
    }))
  })

  it('attack cycle timing is frame-rate independent (idle → windup lands within one frame)', () => {
    fc.assert(fc.property(
      fc.constantFrom(2, 3) as fc.Arbitrary<2 | 3>,
      fc.constantFrom(30, 60, 120, 144, 240),
      (phase, hz) => {
        const needed = 10
        const hits = phase === 2 ? 4 : 7
        let b: Enemy = { ...createBoss(W, H), y: 216, x: W / 2, bossPhase: phase,
          bossHitsReceived: hits, hitsNeeded: needed, bossTimerMs: PHASE_PARAMS[phase].idleMs }
        const dt = 1000 / hz
        let t = 0
        while (b.bossAttack === 'idle' && t < 10_000) { b = moveBoss(b, dt, W, H); t += dt }
        expect(b.bossAttack).toBe('windup')
        // idle timer only runs once at the hover line, which it already is
        expect(Math.abs(t - PHASE_PARAMS[phase].idleMs)).toBeLessThanOrEqual(dt + 1)
        const start = t
        while (b.bossAttack === 'windup' && t < 20_000) { b = moveBoss(b, dt, W, H); t += dt }
        expect(Math.abs(t - start - PHASE_PARAMS[phase].windupMs)).toBeLessThanOrEqual(dt + 1)
      },
    ))
  })
})
