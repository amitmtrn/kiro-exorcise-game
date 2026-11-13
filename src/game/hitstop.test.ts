import { describe, it, expect } from 'vitest'
import { HITSTOP_MS, addHitStop, splitHitStop } from './hitstop'

/** Runs a freeze of HITSTOP_MS at `hz` and returns the total frozen / live ms and the number of fully frozen ticks. */
function run(hz: number, totalMs = 500) {
  const dt = 1000 / hz
  let remaining = HITSTOP_MS, frozen = 0, live = 0, frozenTicks = 0
  const ticks = Math.round(totalMs / dt)
  for (let i = 0; i < ticks; i++) {
    const s = splitHitStop(remaining, dt)
    remaining = s.remainingMs
    frozen += s.frozenMs
    live += s.liveMs
    if (s.liveMs === 0) frozenTicks++
  }
  return { frozen, live, frozenTicks, total: ticks * dt }
}

describe('hit-stop', () => {
  it('is 60 ms', () => {
    expect(HITSTOP_MS).toBe(60)
  })

  it.each([30, 60, 120, 144, 240])('freezes exactly 60 ms at %i Hz', (hz) => {
    const r = run(hz)
    expect(r.frozen).toBeCloseTo(60, 6)
    expect(r.live).toBeCloseTo(r.total - 60, 6)
  })

  it('takes a different number of ticks per frame rate but the same time', () => {
    expect(run(30).frozenTicks).toBeLessThan(run(144).frozenTicks)
  })

  it('a long stall crossing the end of the freeze only advances the remainder', () => {
    expect(splitHitStop(60, 100)).toEqual({ frozenMs: 60, liveMs: 40, remainingMs: 0 })
  })

  it('a step shorter than the budget is fully frozen', () => {
    const s = splitHitStop(60, 16)
    expect(s.liveMs).toBe(0)
    expect(s.frozenMs).toBe(16)
    expect(s.remainingMs).toBe(44)
  })

  it('no budget means no freeze', () => {
    expect(splitHitStop(0, 16)).toEqual({ frozenMs: 0, liveMs: 16, remainingMs: 0 })
  })

  it('overlapping hit-stops take the longer remainder instead of adding up', () => {
    expect(addHitStop(0)).toBe(60)
    expect(addHitStop(25)).toBe(60)
    expect(addHitStop(60)).toBe(60)
    expect(addHitStop(100, 60)).toBe(100)
  })
})
