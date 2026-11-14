import { describe, it, expect } from 'vitest'
import { createFrameBudget, stepFrameBudget } from './quality'

/** Simulated session: each phase is [frameMs, durationMs]. Returns the level timeline. */
function simulate(phases: Array<[number, number]>) {
  let s = createFrameBudget()
  let t = 0
  const changes: Array<{ at: number; level: number }> = []
  for (const [frameMs, dur] of phases) {
    for (let e = 0; e < dur; e += frameMs) {
      const n = stepFrameBudget(s, frameMs)
      t += frameMs
      if (n.level !== s.level) changes.push({ at: Math.round(t), level: n.level })
      s = n
    }
  }
  return { final: s, changes }
}

describe('slow-frame simulation (R4.1)', () => {
  it('steps down to level 3 on 28 ms frames, then recovers to 0 on 9 ms frames', () => {
    const { final, changes } = simulate([[16, 5000], [28, 30_000], [9, 90_000]])
    const levels = changes.map((c) => c.level)
    expect(Math.max(...levels)).toBe(3)
    expect(final.level).toBe(0)
    // monotone down then monotone up: exactly 3 downs then 3 ups
    expect(levels).toEqual([1, 2, 3, 2, 1, 0])
  })

  it('a machine hovering at the border does not flip-flop', () => {
    // alternating 24 ms / 9 ms phases of 10 s: average swings across the band
    const phases: Array<[number, number]> = []
    for (let i = 0; i < 10; i++) phases.push([24, 10_000], [9, 10_000])
    const { changes } = simulate(phases)
    const ups = changes.filter((c, i) => i > 0 && c.level < changes[i - 1].level).length
    expect(changes.length).toBeLessThan(14) // 20 phases; unrestrained it would change every phase boundary and more
    expect(ups).toBeLessThanOrEqual(5)
  })
})

describe('display refresh rate (review fix)', () => {
  it('steps back up at a 60 Hz refresh interval (16.7 ms frames)', () => {
    const { final } = simulate([[16.7, 5000], [28, 30_000], [16.7, 120_000]])
    expect(final.level).toBe(0)
  })
  it('steps back up on a 30 fps-capped display, and does not step down on it', () => {
    const steady = simulate([[33.3, 60_000]])
    expect(steady.final.level).toBe(0)
    const { final } = simulate([[16.7, 3000], [50, 20_000], [33.3, 150_000]])
    expect(final.level).toBe(0)
  })
  it('still steps down at 60 Hz when frames take 28 ms', () => {
    const { final } = simulate([[16.7, 5000], [28, 30_000]])
    expect(final.level).toBe(3)
  })
})
