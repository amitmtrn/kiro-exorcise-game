import { describe, it, expect, beforeEach } from 'vitest'
import {
  createFrameBudget, stepFrameBudget, parseQualityMode, levelForMode, configureQuality, resetQuality,
  getQuality, getQualityInfo, thinParticles, calloutCap, atmosphereOn,
  DOWN_AFTER_MS, UP_AFTER_MS, SETTLE_MS, IGNORE_ABOVE_MS, RESEED_MS,
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
    let s = run(createFrameBudget(), 30, 1000)
    expect(s.level).toBe(0) // average still rising / not yet 2 s over
    s = run(s, 30, DOWN_AFTER_MS + 1500)
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
    while (s.level === 0) s = stepFrameBudget(s, 30)
    expect(s.avgMs).toBe(RESEED_MS)
    expect(s.settleMs).toBe(SETTLE_MS)
  })

  it('steps up after 6 s under 14 ms', () => {
    let s = createFrameBudget(2)
    s = run(s, 8, UP_AFTER_MS - 2000)
    expect(s.level).toBe(2)
    s = run(s, 8, UP_AFTER_MS + SETTLE_MS)
    expect(s.level).toBeLessThan(2)
  })

  it('does nothing between 14 and 20 ms', () => {
    expect(run(createFrameBudget(1), 17, 120_000).level).toBe(1)
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
