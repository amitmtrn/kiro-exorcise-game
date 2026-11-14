import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createRunStats, observeRun, totalBanished } from './runStats'
import type { ObservedState } from './runStats'

/** A random run: per stage, a non-decreasing banish counter that resets on the next stage. */
const stageCounts = fc.array(fc.array(fc.nat({ max: 5 }), { minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 6 })

describe('runStats (properties)', () => {
  it('banished never decreases and equals the sum of the per-stage totals', () => {
    fc.assert(fc.property(stageCounts, (stages) => {
      let r = createRunStats()
      let prev = 0
      let expected = 0
      stages.forEach((incs, i) => {
        let count = 0
        // first observation of a stage sees the reset value 0
        r = observeRun(r, { phase: 'playing', stage: i + 1, stageBanished: 0, combo: 1 }).stats
        for (const inc of incs) {
          count += inc
          r = observeRun(r, { phase: 'playing', stage: i + 1, stageBanished: count, combo: 1 }).stats
          const t = totalBanished(r)
          expect(t).toBeGreaterThanOrEqual(prev)
          prev = t
        }
        expected += count
        expect(totalBanished(r)).toBe(expected)
      })
    }))
  })

  it('bestCombo and stage never decrease, whatever the state sequence', () => {
    const obs = fc.record({
      phase: fc.constantFrom('playing', 'summary', 'gameover', 'victory', 'stageTitle'),
      stage: fc.integer({ min: 1, max: 5 }),
      stageBanished: fc.nat({ max: 50 }),
      combo: fc.integer({ min: 1, max: 4 }),
    }) as fc.Arbitrary<ObservedState>
    fc.assert(fc.property(fc.array(obs, { maxLength: 60 }), (seq) => {
      let r = createRunStats()
      for (const s of seq) {
        const next = observeRun(r, s).stats
        expect(next.bestCombo).toBeGreaterThanOrEqual(r.bestCombo)
        expect(next.stage).toBeGreaterThanOrEqual(r.stage)
        expect(next.bestCombo).toBeLessThanOrEqual(4)
        r = next
      }
    }))
  })
})
