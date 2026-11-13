import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { HITSTOP_MS, splitHitStop, addHitStop } from './hitstop'

const stepArb = fc.double({ min: 0, max: 100, noNaN: true })

describe('hit-stop (properties)', () => {
  it('frozen + live = delta, nothing negative, budget only shrinks', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 500, noNaN: true }), stepArb, (rem, dt) => {
      const s = splitHitStop(rem, dt)
      expect(s.frozenMs + s.liveMs).toBeCloseTo(dt, 9)
      expect(s.frozenMs).toBeGreaterThanOrEqual(0)
      expect(s.liveMs).toBeGreaterThanOrEqual(0)
      expect(s.remainingMs).toBeGreaterThanOrEqual(0)
      expect(s.remainingMs).toBeLessThanOrEqual(rem)
      expect(s.remainingMs + s.frozenMs).toBeCloseTo(rem, 9)
    }))
  })

  it('total frozen time is the budget for any partition of the elapsed time', () => {
    fc.assert(fc.property(fc.array(fc.double({ min: 1, max: 100, noNaN: true }), { minLength: 1, maxLength: 80 }), (steps) => {
      const elapsed = steps.reduce((a, b) => a + b, 0)
      let rem = HITSTOP_MS, frozen = 0, live = 0
      for (const dt of steps) {
        const s = splitHitStop(rem, dt)
        rem = s.remainingMs; frozen += s.frozenMs; live += s.liveMs
      }
      expect(frozen).toBeCloseTo(Math.min(HITSTOP_MS, elapsed), 6)
      expect(live).toBeCloseTo(Math.max(0, elapsed - HITSTOP_MS), 6)
    }))
  })

  it('game time after a hit is the same at 30, 60 and 144 Hz', () => {
    fc.assert(fc.property(fc.integer({ min: 200, max: 1500 }), (elapsedMs) => {
      const liveAt = (hz: number) => {
        const dt = 1000 / hz
        const n = Math.round(elapsedMs / dt)
        let rem = HITSTOP_MS, live = 0
        for (let i = 0; i < n; i++) { const s = splitHitStop(rem, dt); rem = s.remainingMs; live += s.liveMs }
        return { live, elapsed: n * dt }
      }
      for (const hz of [30, 60, 144]) {
        const r = liveAt(hz)
        expect(r.live).toBeCloseTo(r.elapsed - HITSTOP_MS, 6)
      }
    }))
  })

  it('addHitStop never shortens a freeze and never exceeds the longer input', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 300, noNaN: true }), fc.double({ min: 0, max: 300, noNaN: true }), (cur, ms) => {
      const r = addHitStop(cur, ms)
      expect(r).toBeGreaterThanOrEqual(cur)
      expect(r).toBe(Math.max(cur, ms))
    }))
  })
})
