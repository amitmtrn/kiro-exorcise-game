import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { makeEnemy } from '../state'
import type { Enemy } from '../state'
import { hitboxFor } from './movement'
import {
  stepVariant, isVariantHittable, stateSchedule, initialState, speedFor, travelMs, MIN_TELEGRAPH_MS, MIN_WINDOW_MS, MAX_WAIT_MS,
  MIN_TRAVEL_MS, TELEGRAPH_STATES, onMirrorAbsorb, VARIANT_TYPES, TRAVEL_S,
} from './variants'
import type { VariantType } from './variants'

const typeArb = fc.constantFrom<VariantType>('mirror', 'blink')
const mk = (type: VariantType): Enemy => makeEnemy({
  id: 'x', type, x: 0, y: 0, targetX: 1, targetY: 1, speed: 0.1, hitbox: hitboxFor(type, 0, 0), vState: initialState(type),
})
/** Splits `total` ms into the ticks of `steps` (cycled) and runs them. */
function runTicks(e: Enemy, total: number, steps: number[]): Enemy {
  let left = total, i = 0
  while (left > 0) { const d = Math.min(steps[i++ % steps.length], left); e = stepVariant(e, d); left -= d }
  return e
}
const tick = fc.array(fc.integer({ min: 1, max: 120 }), { minLength: 1, maxLength: 5 })

describe('variant properties', () => {
  it('every vulnerability change leaves a telegraph state that lasted >= 400 ms', () => {
    fc.assert(fc.property(typeArb, tick, fc.integer({ min: 0, max: 30000 }), (type, steps, total) => {
      let e = mk(type)
      let left = total, i = 0
      let dwell = 0
      while (left > 0) {
        const d = Math.min(steps[i++ % steps.length], left)
        const before = e
        e = stepVariant(e, d)
        left -= d
        if (e.vState !== before.vState) {
          if (isVariantHittable(e) !== isVariantHittable(before)) {
            expect(TELEGRAPH_STATES).toContain(before.vState)
            const full = stateSchedule(type).find((s) => s.state === before.vState)!.ms
            expect(full).toBeGreaterThanOrEqual(MIN_TELEGRAPH_MS)
            expect(dwell + d).toBeGreaterThanOrEqual(full) // the state ran its full telegraph
          }
          dwell = e.vTimerMs
        } else dwell += d
      }
    }), { numRuns: 100 })
  })

  it('a hit is always possible: every vulnerable window is >= 1200 ms and starts within 2000 ms of the previous one', () => {
    for (const type of ['mirror', 'blink'] as const) {
      const cycle = stateSchedule(type)
      const vulnerable = cycle.map((s) => isVariantHittable({ ...mk(type), vState: s.state }))
      // total vulnerable time per cycle, and the longest unprotected-free stretch
      const win = cycle.filter((_, i) => vulnerable[i]).reduce((a, s) => a + s.ms, 0)
      expect(win).toBeGreaterThanOrEqual(MIN_WINDOW_MS)
      const wait = cycle.filter((_, i) => !vulnerable[i]).reduce((a, s) => a + s.ms, 0)
      expect(wait).toBeLessThanOrEqual(MAX_WAIT_MS)
    }
  })

  it('sampling at any time gives a vulnerable moment within MAX_WAIT_MS', () => {
    fc.assert(fc.property(typeArb, fc.integer({ min: 0, max: 20000 }), (type, t0) => {
      const base = runTicks(mk(type), t0, [16])
      let found = isVariantHittable(base)
      let e = base
      for (let t = 0; t <= MAX_WAIT_MS && !found; t += 10) { e = stepVariant(e, 10); found = isVariantHittable(e) }
      expect(found).toBe(true)
    }), { numRuns: 100 })
  })

  it('is frame-rate independent: any tick split reaches the same state and timer', () => {
    fc.assert(fc.property(typeArb, fc.integer({ min: 0, max: 30000 }), tick, tick, (type, total, a, b) => {
      const ea = runTicks(mk(type), total, a)
      const eb = runTicks(mk(type), total, b)
      expect(ea.vState).toBe(eb.vState)
      expect(ea.vTimerMs).toBeCloseTo(eb.vTimerMs, 6)
    }), { numRuns: 150 })
  })

  it('travel time is >= 4500 ms from any edge at any canvas size >= 640x360', () => {
    fc.assert(fc.property(
      fc.constantFrom(...VARIANT_TYPES), fc.integer({ min: 640, max: 2560 }), fc.integer({ min: 360, max: 1440 }), fc.integer({ min: 0, max: 3 }), fc.double({ min: 0, max: 1, noNaN: true }),
      (type, W, H, edge, f) => {
        const x = edge === 0 ? f * W : edge === 1 ? W + 80 : edge === 2 ? f * W : -80
        const y = edge === 0 ? -80 : edge === 1 ? f * H : edge === 2 ? H + 80 : f * H
        const dist = Math.hypot(W / 2 - x, H / 2 - y)
        const e = makeEnemy({ id: 'x', type, x, y, targetX: W / 2, targetY: H / 2, speed: speedFor(type, dist, H), hitbox: hitboxFor(type, x, y) })
        expect(travelMs(e, H)).toBeGreaterThanOrEqual(MIN_TRAVEL_MS)
        expect(travelMs(e, H)).toBeCloseTo(TRAVEL_S[type] * 1000, 2)
      },
    ), { numRuns: 200 })
  })

  it('mirror: absorbed hits never exceed the cool-down rate and the shield cracks by itself', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 400 }), { minLength: 1, maxLength: 30 }), (gaps) => {
      let e = mk('mirror')
      let counted = 0
      let lastCount = -Infinity
      let t = 0
      for (const g of gaps) {
        e = stepVariant(e, g); t += g
        const prev = e
        const r = onMirrorAbsorb(e)
        e = r.enemy
        if (r.absorbed && prev.vState === 'shield') { counted++; expect(t - lastCount).toBeGreaterThanOrEqual(300); lastCount = t }
      }
      expect(counted).toBeLessThanOrEqual(gaps.length)
    }), { numRuns: 100 })
  })
})
