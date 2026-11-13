import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { makeKnock, knockPose, tickKnocks, KNOCK_LIFE_MS } from './knock'
import { makeEnemy } from './state'
import type { Swipe } from './swipe'

const ghost = makeEnemy({ id: 'g', type: 'ghost', x: 400, y: 300, targetX: 0, targetY: 0, speed: 1, hitbox: { x: 0, y: 0, w: 1, h: 1 } })

const swipeArb: fc.Arbitrary<Swipe> = fc.record({
  a: fc.double({ min: 0, max: Math.PI * 2, noNaN: true }),
  mag: fc.double({ min: 0, max: 500, noNaN: true }),
  source: fc.constantFrom('shift', 'radial', 'default') as fc.Arbitrary<Swipe['source']>,
}).map(({ a, mag, source }) => ({ dx: Math.cos(a), dy: Math.sin(a), mag, source }))
const heightArb = fc.integer({ min: 200, max: 2000 })
const ageArb = fc.double({ min: 0, max: KNOCK_LIFE_MS, noNaN: true })

describe('knock trajectory (properties)', () => {
  it('displacement points along the swipe vector and equals the distance travelled', () => {
    fc.assert(fc.property(swipeArb, heightArb, ageArb, (sw, h, age) => {
      const k = { ...makeKnock(ghost, sw, h), ageMs: age }
      const p = knockPose(k)
      const dot = (p.x - 400) * sw.dx + (p.y - 300) * sw.dy
      expect(dot).toBeGreaterThanOrEqual(-1e-9)
      expect(dot).toBeCloseTo(p.distance, 6)
      expect(Math.hypot(p.x - 400, p.y - 300)).toBeCloseTo(p.distance, 6)
    }))
  })

  it('distance never decreases, alpha and scale never increase with age', () => {
    fc.assert(fc.property(swipeArb, heightArb, ageArb, ageArb, (sw, h, a, b) => {
      const [t0, t1] = a <= b ? [a, b] : [b, a]
      const k = makeKnock(ghost, sw, h)
      const p0 = knockPose({ ...k, ageMs: t0 }), p1 = knockPose({ ...k, ageMs: t1 })
      expect(p1.distance).toBeGreaterThanOrEqual(p0.distance - 1e-9)
      expect(p1.alpha).toBeLessThanOrEqual(p0.alpha + 1e-12)
      expect(p1.scale).toBeLessThanOrEqual(p0.scale + 1e-12)
      for (const p of [p0, p1]) {
        expect(p.alpha).toBeGreaterThanOrEqual(0)
        expect(p.alpha).toBeLessThanOrEqual(1)
        expect(p.scale).toBeGreaterThan(0)
      }
    }))
  })

  it('the pose after the same elapsed time is independent of the step size', () => {
    fc.assert(fc.property(swipeArb, heightArb, fc.integer({ min: 1, max: 40 }), (sw, h, n) => {
      const total = 500
      let ks = [makeKnock(ghost, sw, h)]
      for (let i = 0; i < n; i++) ks = tickKnocks(ks, total / n)
      const ref = knockPose({ ...makeKnock(ghost, sw, h), ageMs: total })
      const got = knockPose(ks[0])
      expect(got.x).toBeCloseTo(ref.x, 6)
      expect(got.y).toBeCloseTo(ref.y, 6)
      expect(got.alpha).toBeCloseTo(ref.alpha, 9)
    }))
  })

  it('every knock is gone once the lifetime has elapsed, at any frame rate', () => {
    fc.assert(fc.property(swipeArb, heightArb, fc.constantFrom(30, 60, 120, 144, 240), (sw, h, hz) => {
      let ks = [makeKnock(ghost, sw, h)]
      const dt = 1000 / hz
      for (let t = 0; t < KNOCK_LIFE_MS + dt; t += dt) ks = tickKnocks(ks, dt)
      expect(ks).toHaveLength(0)
    }))
  })
})
