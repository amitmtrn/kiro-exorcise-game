import { describe, expect, it } from 'vitest'
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

  /**
   * Runs a constant frame time for `totalMs` and reports whether every level change went the same way.
   * Only the direction is kept (no per-change objects), so the long runs stay cheap.
   */
  function oneDirection(f: number, totalMs: number, start: number): boolean {
    let s = createFrameBudget(start as 0)
    let dir = 0
    for (let t = 0; t < totalMs; t += f) {
      const n = stepFrameBudget(s, f)
      if (n.level !== s.level) {
        const d = Math.sign(n.level - s.level)
        if (dir !== 0 && d !== dir) return false
        dir = d
      }
      s = n
    }
    return true
  }

  // 60 s is enough (ci-timeout design.md): the last possible level change is before ~40 s (refresh estimate settled by
  // 10.3 s at most, then three 9 s up steps), and the measured worst case over a sweep of f and start levels is 25.3 s.
  it('constant frame time moves the level in one direction only (R1.5)', () => {
    fc.assert(fc.property(fc.double({ min: 2, max: 120, noNaN: true }), fc.integer({ min: 0, max: 3 }), (f, start) => oneDirection(f, 60_000, start)), { numRuns: 200 })
  }, 30_000) // ~0.2 s locally; 200 runs of up to 30 000 steps, so a slow shared runner gets an explicit budget

  // Fixed examples at the original 120 s span: both ends of the range and every band edge
  // (14 / 20 ms floors, 60 Hz and 30 Hz scaled thresholds 16.67 x 1.1, x 1.3 and 33.33 x 1.1, x 1.3, and the 15 % snap edges).
  it.each([2, 120, 14, 16.67, 18.34, 20, 21.67, 28.9, 29, 36.67, 38.3, 38.4, 43.33])('frame time %s ms moves the level one way only over 120 s, from every start level (R1.5)', (f) => {
    for (const start of [0, 1, 2, 3]) expect(oneDirection(f, 120_000, start)).toBe(true)
  })

  it('a steady 30 fps cap never steps down from level 0', () => {
    fc.assert(fc.property(fc.double({ min: 30, max: 36, noNaN: true }), (f) => levels(f, 120_000, 0).changes.length === 0), { numRuns: 60 })
  })

  it('60 Hz with frame-time jitter of up to +-4 ms still steps back up', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 4, noNaN: true }), fc.integer({ min: 1, max: 2 ** 30 }), (j, seed0) => {
      let seed = seed0
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
      let s = createFrameBudget(3)
      for (let t = 0; t < 60_000;) { const d = 16.67 + (rnd() * 2 - 1) * j; s = stepFrameBudget(s, d); t += d }
      return s.level === 0
    }), { numRuns: 40 })
  })

  it('the same wall-clock span in 8 ms or 32 ms steps gives the same level and refresh class (R1.1)', () => {
    const run = (f: number) => { let s = createFrameBudget(3); for (let t = 0; t < 40_000; t += f) s = stepFrameBudget(s, f); return s.level }
    expect(run(32)).toBe(run(8))
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

  it('after the display has run faster, a steady 29-38 ms stream steps down and never up', () => {
    fc.assert(fc.property(fc.double({ min: 29, max: 38, noNaN: true }), fc.double({ min: 8, max: 20, noNaN: true }), fc.integer({ min: 0, max: 2 }), (slow, fast, start) => {
      let s = createFrameBudget(start as 0)
      for (let t = 0; t < 1500; t += fast) s = stepFrameBudget(s, fast)
      const startLevel = s.level
      let t = 0
      while (t < 120_000) {
        const n = stepFrameBudget(s, slow)
        if (n.level < s.level) return false
        s = n; t += slow
      }
      return s.level > startLevel
    }), { numRuns: 100 })
  })

  it('a display that never ran faster than 25 ms is still taken for a 30 Hz panel', () => {
    fc.assert(fc.property(fc.double({ min: 29, max: 38, noNaN: true }), fc.array(fc.double({ min: 25, max: 40, noNaN: true }), { maxLength: 20 }), (f, warm) => {
      let s = createFrameBudget(0)
      for (const d of warm) s = stepFrameBudget(s, d)
      if (s.level !== 0) return true
      for (let t = 0; t < 60_000; t += f) s = stepFrameBudget(s, f)
      return s.level === 0
    }), { numRuns: 60 })
  })

  it('reaction time is set by elapsed ms, not frame count', () => {
    // 29–38.3 ms is indistinguishable from a 30 Hz display and does not step down (R1.3)
    fc.assert(fc.property(fc.oneof(fc.double({ min: 24, max: 28, noNaN: true }), fc.double({ min: 39, max: 100, noNaN: true })), (f) => {
      let s = createFrameBudget(); let t = 0
      while (s.level === 0 && t < 30_000) { s = stepFrameBudget(s, f); t += f }
      // average needs < ~1.5 s to cross 20 ms from 16 ms, 2 s over budget, up to 2.5 s for the refresh estimate to pass 30 Hz, one frame
      return s.level === 1 && t <= 2000 + 1500 + 2500 + f
    }))
    fc.assert(fc.property(fc.double({ min: 3, max: 12, noNaN: true }), (f) => {
      let s = createFrameBudget(1); let t = 0
      while (s.level === 1 && t < 30_000) { s = stepFrameBudget(s, f); t += f }
      return s.level === 0 && t <= 6000 + 1500 + f
    }))
  })
})
