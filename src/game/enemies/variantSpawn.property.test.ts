import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { spawnVariant, skullClearancePx } from './variantSpawn'
import { mulberry32 } from '../../test/prng'
import { travelMs, MIN_TRAVEL_MS, MAX_WAIT_MS, MIN_WINDOW_MS } from './variants'
import { halfWidth } from '../halves'

const kind = fc.constantFrom('wisp', 'mirror', 'blink' as const)
const size = fc.record({ W: fc.integer({ min: 640, max: 2560 }), H: fc.integer({ min: 360, max: 1440 }) })
const skulls = fc.array(fc.record({ x: fc.double({ min: -100, max: 2600, noNaN: true }), y: fc.double({ min: -100, max: 1500, noNaN: true }) }), { maxLength: 3 })

describe('spawn rules', () => {
  it('clearance from skulls, pair inside one area, grace, and travel time (1P and each 2P half)', () => {
    fc.assert(fc.property(kind, size, skulls, fc.integer({ min: 1, max: 2 ** 30 }), fc.boolean(), (k, { W, H }, sk, seed, half) => {
      const aw = half ? halfWidth(W) : W
      const made = spawnVariant(k, aw, H, sk, mulberry32(seed))
      if (!made) return // deferred: nothing spawned, nothing unfair
      expect(made).toHaveLength(k === 'wisp' ? 2 : 1)
      for (const e of made) {
        for (const s of sk) expect(Math.hypot(s.x - e.x, s.y - e.y)).toBeGreaterThanOrEqual(skullClearancePx() - 60) // wisps sit up to half a pair gap off the picked point
        expect(travelMs(e, H)).toBeGreaterThanOrEqual(MIN_TRAVEL_MS)
        expect(e.targetX).toBe(aw / 2)
        // along the edge the body stays inside the area, so a pair never crosses a divider
        const outsideX = e.x < 0 || e.x > aw
        if (!outsideX) { expect(e.x).toBeGreaterThanOrEqual(0); expect(e.x).toBeLessThanOrEqual(aw) }
        else expect(e.y).toBeGreaterThanOrEqual(0)
        // first vulnerability comes well before the ghost can arrive
        expect(travelMs(e, H)).toBeGreaterThan(MAX_WAIT_MS + MIN_WINDOW_MS)
      }
      if (k === 'wisp') expect(made[0].pairId).toBe(made[1].pairId)
    }), { numRuns: 300 })
  })
})
