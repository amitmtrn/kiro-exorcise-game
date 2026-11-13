import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { tickParticles, tickScoreLabels, spawnScoreLabel } from './particles'
import { FRAME_MS } from './state'
import type { Particle } from './state'

const particleArb: fc.Arbitrary<Particle> = fc.record({
  x: fc.double({ min: -500, max: 500, noNaN: true }),
  y: fc.double({ min: -500, max: 500, noNaN: true }),
  vx: fc.double({ min: -6, max: 6, noNaN: true }),
  vy: fc.double({ min: -6, max: 6, noNaN: true }),
  alpha: fc.constant(1),
  decay: fc.double({ min: 0.01, max: 0.2, noNaN: true }),
  color: fc.constant('#fff'),
  radius: fc.constant(3),
})

/** Splits `totalMs` into `n` equal steps. */
const steps = (totalMs: number, n: number) => Array.from({ length: n }, () => totalMs / n)

describe('time-based particles and labels (properties, BUG-4)', () => {
  it('the same elapsed time gives the same particle state at any step size', () => {
    fc.assert(fc.property(
      particleArb, fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }),
      (p, nA, nB) => {
        const total = 6 * FRAME_MS // ≤ 6 frames: alpha stays well above 0 for decay ≤ 0.1
        const run = (n: number) => steps(total, n).reduce<Particle[]>((ps, ms) => tickParticles(ps, ms), [{ ...p, decay: Math.min(p.decay, 0.1) }])
        const [a] = run(nA), [b] = run(nB)
        expect(a).toBeDefined()
        expect(a.x).toBeCloseTo(b.x, 6)
        expect(a.y).toBeCloseTo(b.y, 6)
        expect(a.alpha).toBeCloseTo(b.alpha, 9)
      },
    ))
  })

  it('a particle dies after the same elapsed time at any frame rate', () => {
    fc.assert(fc.property(particleArb, fc.constantFrom(30, 60, 120, 144, 240), (p, hz) => {
      const dt = 1000 / hz
      let ps: Particle[] = [p]
      let elapsed = 0
      while (ps.length > 0 && elapsed < 5000) { ps = tickParticles(ps, dt); elapsed += dt }
      const expected = (1 / p.decay) * FRAME_MS
      expect(Math.abs(elapsed - expected)).toBeLessThanOrEqual(dt + 1e-6)
    }))
  })

  it('a score label lives ~600 ms at any frame rate', () => {
    fc.assert(fc.property(fc.constantFrom(30, 60, 120, 144, 240), (hz) => {
      const dt = 1000 / hz
      let ls = [spawnScoreLabel(0, 0, 100)]
      let elapsed = 0
      while (ls.length > 0 && elapsed < 5000) { ls = tickScoreLabels(ls, dt); elapsed += dt }
      expect(Math.abs(elapsed - 600)).toBeLessThanOrEqual(dt + 1e-6)
    }))
  })

  it('the default step is exactly one 60 Hz frame', () => {
    fc.assert(fc.property(particleArb, (p) => {
      expect(tickParticles([p])).toEqual(tickParticles([p], FRAME_MS))
    }))
  })
})
