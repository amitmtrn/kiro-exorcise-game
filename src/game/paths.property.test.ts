import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { mulberry32 } from '../test/prng'
import { makePath, makeSwarm, pathPosition, pathDurationMs, marginPx } from './paths'
import type { PathKind } from './paths'

const kindArb = fc.constantFrom<PathKind>('line', 'arc', 'flyby', 'drop')
const sizeArb = fc.record({ W: fc.integer({ min: 480, max: 2200 }), H: fc.integer({ min: 270, max: 1250 }) })
const speedArb = fc.double({ min: 0.1, max: 0.9, noNaN: true })
const edgesArb = fc.constantFrom<'leftRight' | 'all'>('leftRight', 'all')

describe('paths — properties', () => {
  it('every position stays within the canvas extended by the margin (R1.6)', () => {
    fc.assert(fc.property(
      kindArb, sizeArb, speedArb, fc.integer({ min: 1, max: 1e6 }), edgesArb, fc.boolean(),
      fc.double({ min: 0, max: 1.5, noNaN: true }),
      (kind, { W, H }, speed, seed, edges, through, t) => {
        const p = makePath(kind, { W, H, speed, rand: mulberry32(seed), edges, through })
        const pt = pathPosition(p, pathDurationMs(p, W, H) * t, W, H)
        const m = marginPx(H) + 1e-6
        expect(pt.x).toBeGreaterThanOrEqual(-m)
        expect(pt.x).toBeLessThanOrEqual(W + m)
        expect(pt.y).toBeGreaterThanOrEqual(-m)
        expect(pt.y).toBeLessThanOrEqual(H + m)
      },
    ))
  })

  it('swarm members stay within the extended canvas', () => {
    fc.assert(fc.property(
      sizeArb, speedArb, fc.integer({ min: 1, max: 1e6 }), fc.integer({ min: 3, max: 5 }),
      fc.double({ min: 0, max: 1.5, noNaN: true }),
      ({ W, H }, speed, seed, n, t) => {
        for (const p of makeSwarm(n, { W, H, speed, rand: mulberry32(seed) })) {
          const pt = pathPosition(p, pathDurationMs(p, W, H) * t, W, H)
          const m = marginPx(H) + 1e-6
          expect(pt.x).toBeGreaterThanOrEqual(-m)
          expect(pt.x).toBeLessThanOrEqual(W + m)
          expect(pt.y).toBeGreaterThanOrEqual(-m)
          expect(pt.y).toBeLessThanOrEqual(H + m)
        }
      },
    ))
  })

  it('uniform canvas scale by k scales positions and keeps the duration (R6.2)', () => {
    fc.assert(fc.property(
      kindArb, fc.integer({ min: 540, max: 900 }), fc.double({ min: 1, max: 2, noNaN: true }),
      speedArb, fc.integer({ min: 1, max: 1e6 }), fc.double({ min: 0, max: 1.2, noNaN: true }),
      (kind, H, k, speed, seed, t) => {
        const W = Math.round(H * 16 / 9)
        // Same fractions: build once at (W, H); the fractions carry over to the scaled canvas.
        const p = makePath(kind, { W, H, speed, rand: mulberry32(seed) })
        const d1 = pathDurationMs(p, W, H)
        const d2 = pathDurationMs(p, W * k, H * k)
        expect(d2).toBeCloseTo(d1, 6)
        const a = pathPosition(p, d1 * t, W, H)
        const b = pathPosition(p, d1 * t, W * k, H * k)
        expect(b.x).toBeCloseTo(a.x * k, 6)
        expect(b.y).toBeCloseTo(a.y * k, 6)
      },
    ))
  })
})
