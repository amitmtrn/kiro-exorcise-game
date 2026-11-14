import { describe, it } from 'vitest'
import fc from 'fast-check'
import { createFrameBudget, stepFrameBudget, SETTLE_MS, type FrameBudgetState } from './quality'

function levels(frameMs: number, totalMs: number, start = 0): { s: FrameBudgetState; changes: Array<{ t: number; from: number; to: number }> } {
  let s = createFrameBudget(start as 0)
  const changes: Array<{ t: number; from: number; to: number }> = []
  let t = 0
  for (; t < totalMs; t += frameMs) {
    const n = stepFrameBudget(s, frameMs)
    if (n.level !== s.level) changes.push({ t, from: s.level, to: n.level })
    s = n
  }
  return { s, changes }
}

describe('frame budget properties', () => {
  it('level stays in 0..3 for any frame stream', () => {
    fc.assert(fc.property(fc.array(fc.double({ min: 0, max: 400, noNaN: true }), { maxLength: 3000 }), fc.integer({ min: 0, max: 3 }), (ds, start) => {
      let s = createFrameBudget(start as 0)
      for (const d of ds) { s = stepFrameBudget(s, d); if (s.level < 0 || s.level > 3) return false }
      return true
    }))
  })

  it('constant frame time moves the level in one direction only', () => {
    fc.assert(fc.property(fc.double({ min: 2, max: 120, noNaN: true }), fc.integer({ min: 0, max: 3 }), (f, start) => {
      const { changes } = levels(f, 120_000, start)
      const dirs = new Set(changes.map((c) => Math.sign(c.to - c.from)))
      return dirs.size <= 1
    }), { numRuns: 60 })
  })

  it('no two changes closer than the settle time', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.double({ min: 3, max: 60, noNaN: true }), fc.integer({ min: 1, max: 600 })), { minLength: 1, maxLength: 12 }), (segs) => {
      let s = createFrameBudget()
      let t = 0
      let last = -Infinity
      for (const [f, n] of segs) {
        for (let i = 0; i < n; i++) {
          const nx = stepFrameBudget(s, f)
          t += f
          if (nx.level !== s.level) { if (t - last < SETTLE_MS - 1) return false; last = t }
          s = nx
        }
      }
      return true
    }))
  })

  it('reaction time is set by elapsed ms, not frame count', () => {
    fc.assert(fc.property(fc.double({ min: 24, max: 100, noNaN: true }), (f) => {
      let s = createFrameBudget(); let t = 0
      while (s.level === 0 && t < 30_000) { s = stepFrameBudget(s, f); t += f }
      // average needs < ~1.5 s to cross 20 ms from 16 ms, plus 2 s over budget, plus one frame
      return s.level === 1 && t <= 2000 + 1500 + f
    }))
    fc.assert(fc.property(fc.double({ min: 3, max: 12, noNaN: true }), (f) => {
      let s = createFrameBudget(1); let t = 0
      while (s.level === 1 && t < 30_000) { s = stepFrameBudget(s, f); t += f }
      return s.level === 0 && t <= 6000 + 1500 + f
    }))
  })
})
