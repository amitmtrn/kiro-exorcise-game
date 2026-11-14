import { describe, it, expect, beforeEach } from 'vitest'
import {
  createFrameBudget, stepFrameBudget, parseQualityMode, levelForMode, configureQuality, resetQuality,
  getQuality, getQualityInfo, thinParticles, calloutCap, atmosphereOn,
  DOWN_AFTER_MS, UP_AFTER_MS, SETTLE_MS, IGNORE_ABOVE_MS, reseedMs, downThresholdMs, upThresholdMs, SEEN_FAST_MS,
  type FrameBudgetState,
} from './quality'

function run(s: FrameBudgetState, frameMs: number, totalMs: number, stepMs = frameMs): FrameBudgetState {
  for (let t = 0; t < totalMs; t += stepMs) s = stepFrameBudget(s, stepMs)
  return s
}

describe('stepFrameBudget', () => {
  it('stays at level 0 on a healthy 16.7 ms stream', () => {
    expect(run(createFrameBudget(), 16.7, 60_000).level).toBe(0)
  })

  it('steps down only after the average has been over 20 ms for 2 s', () => {
    let s = run(createFrameBudget(), 25, 1000)
    expect(s.level).toBe(0) // average still rising / not yet 2 s over
    s = run(s, 25, DOWN_AFTER_MS + 1500)
    expect(s.level).toBe(1)
  })

  it('does not change again within the settle time', () => {
    let s = run(createFrameBudget(), 40, 6000)
    const level = s.level
    expect(level).toBeGreaterThanOrEqual(1)
    s = createFrameBudget(level)
    s = { ...s, settleMs: SETTLE_MS, avgMs: 40 }
    s = run(s, 40, SETTLE_MS - 100)
    expect(s.level).toBe(level)
  })

  it('re-seeds the average after a change', () => {
    let s = createFrameBudget()
    while (s.level === 0) s = stepFrameBudget(s, 25)
    expect(s.avgMs).toBeCloseTo((downThresholdMs(s.refMs) + upThresholdMs(s.refMs)) / 2, 9)
    expect(s.avgMs).toBe(reseedMs(s.refMs))
    expect(s.settleMs).toBe(SETTLE_MS)
  })

  it('re-seeds to the middle of the 60 Hz and 30 Hz bands, not a fixed 17 ms', () => {
    expect(reseedMs(16.67)).toBeCloseTo((16.67 * 1.3 + 16.67 * 1.1) / 2, 6)
    expect(reseedMs(33.33)).toBeCloseTo((33.33 * 1.3 + 33.33 * 1.1) / 2, 6)
    expect(reseedMs(8.33)).toBeCloseTo(17, 6)
    expect(reseedMs(33.33, false)).toBeCloseTo(reseedMs(16.67), 6)
  })

  it('a display that ran at 60 Hz and then drops to a steady 33 ms steps down (not a 30 Hz panel)', () => {
    let s = run(createFrameBudget(0), 16.67, SEEN_FAST_MS + 500)
    expect(s.level).toBe(0)
    s = run(s, 33.33, 30_000)
    expect(s.level).toBeGreaterThan(0)
  })

  it('a display that never ran faster than 30 fps keeps level 0 even after a long time', () => {
    expect(run(createFrameBudget(0), 33.33, 300_000).level).toBe(0)
  })

  it('a few fast frames are not enough to count as having seen a faster display', () => {
    let s = run(createFrameBudget(0), 10, 300)
    s = run(s, 33.33, 60_000)
    expect(s.level).toBe(0)
  })

  it('steps up after 6 s under 14 ms', () => {
    let s = createFrameBudget(2)
    s = run(s, 8, UP_AFTER_MS - 2000)
    expect(s.level).toBe(2)
    s = run(s, 8, UP_AFTER_MS + SETTLE_MS)
    expect(s.level).toBeLessThan(2)
  })

  it('does nothing in the dead band between the up and down thresholds', () => {
    // 16.7 / 25 ms intervals (a 60 Hz display, average 20.8 ms): above the 18.3 ms up threshold, below the 21.7 ms down threshold
    let st: FrameBudgetState = createFrameBudget(1)
    for (let t = 0; t < 120_000; t += 42) { st = stepFrameBudget(st, 16.67); st = stepFrameBudget(st, 25) }
    expect(st.level).toBe(1)
  })

  it('a steady 30 fps cap neither steps down nor flip-flops (R1.5)', () => {
    expect(run(createFrameBudget(0), 33.33, 120_000).level).toBe(0)
  })

  it('a steady 40 ms (25 fps) machine is slow, not a display: it steps down', () => {
    expect(run(createFrameBudget(0), 40, 20_000).level).toBeGreaterThan(0)
  })

  it('the refresh estimate falls with time constant 300 ms, whatever the frame rate', () => {
    // 600 ms of 16 ms frames: the gap of 14 ms shrinks by exp(-2). Same span in 8 ms frames reaches the same gap fraction.
    const gapAfter = (f: number) => { let s = { ...createFrameBudget(), refMs: 30 }; for (let t = 0; t < 600; t += f) s = stepFrameBudget(s, f); return (s.refMs - f) / (30 - f) }
    expect(gapAfter(16)).toBeCloseTo(Math.exp(-2), 1)
    expect(gapAfter(8)).toBeCloseTo(Math.exp(-2), 1)
  })

  it('steady frames at the 60 Hz refresh interval step back up (review fix)', () => {
    expect(run(createFrameBudget(1), 17, 120_000).level).toBe(0)
  })

  it('never goes below 0 or above 3', () => {
    expect(run(createFrameBudget(), 100, 120_000).level).toBe(3)
    expect(run(createFrameBudget(3), 4, 300_000).level).toBe(0)
  })

  it('ignores pauses and invalid deltas', () => {
    const s = createFrameBudget()
    for (const d of [IGNORE_ABOVE_MS + 1, 5000, 0, -3, NaN, Infinity]) expect(stepFrameBudget(s, d)).toBe(s)
  })

  it('lengthens the up wait after a down that follows an up soon', () => {
    let s = createFrameBudget(2)
    s = run(s, 8, UP_AFTER_MS + SETTLE_MS + 500) // steps up to 1
    expect(s.level).toBe(1)
    s = run(s, 40, 8000) // slow again quickly: steps down
    expect(s.level).toBeGreaterThanOrEqual(2)
    expect(s.upPenalty).toBeGreaterThan(1)
  })
})

describe('URL override', () => {
  it('parses the mode, default auto', () => {
    expect(parseQualityMode('')).toBe('auto')
    expect(parseQualityMode('?quality=low')).toBe('low')
    expect(parseQualityMode('?quality=MED')).toBe('med')
    expect(parseQualityMode('?quality=high&x=1')).toBe('high')
    expect(parseQualityMode('?quality=ultra')).toBe('auto')
    expect(parseQualityMode('?quality=')).toBe('auto')
  })
  it('maps modes to pinned levels', () => {
    expect(levelForMode('high')).toBe(0)
    expect(levelForMode('med')).toBe(2)
    expect(levelForMode('low')).toBe(3)
    expect(levelForMode('auto')).toBeNull()
  })
})

describe('active level', () => {
  beforeEach(() => resetQuality())
  it('pinned modes set the level', () => {
    configureQuality('low')
    expect(getQuality()).toBe(3)
    expect(getQualityInfo().mode).toBe('low')
    configureQuality('auto')
    expect(getQuality()).toBe(3) // auto keeps the level until the monitor moves it
  })
  it('level 0 is the identity', () => {
    const a = [1, 2, 3, 4]
    expect(thinParticles(a, 0)).toBe(a)
    expect(calloutCap(0)).toBe(3)
    expect(atmosphereOn(0)).toBe(true)
  })
  it('level 1+ thins and caps', () => {
    expect(thinParticles([1, 2, 3, 4, 5], 1)).toEqual([1, 3, 5])
    expect(calloutCap(2)).toBe(1)
    expect(atmosphereOn(2)).toBe(true)
    expect(atmosphereOn(3)).toBe(false)
  })
})
