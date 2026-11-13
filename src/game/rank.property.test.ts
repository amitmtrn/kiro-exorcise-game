import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { RANKS, rankForScore, rankIndexForScore } from './rank'

describe('rank (properties)', () => {
  it('rank index is non-decreasing in the score', () => {
    fc.assert(fc.property(fc.integer({ min: -1000, max: 100_000 }), fc.integer({ min: -1000, max: 100_000 }), (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      expect(rankIndexForScore(lo)).toBeLessThanOrEqual(rankIndexForScore(hi))
    }))
  })

  it('always returns one of the known titles for any double', () => {
    const titles = RANKS.map((r) => r.title)
    fc.assert(fc.property(fc.double({ noDefaultInfinity: false }), (n) => {
      expect(titles).toContain(rankForScore(n))
    }))
  })
})
