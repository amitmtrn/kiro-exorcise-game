import { describe, it, expect } from 'vitest'
import { StepScheduler, LOOKAHEAD_SEC, TICK_MS } from './scheduler'

function make(bpm = 120, steps = 16) {
  const calls: Array<{ step: number; time: number }> = []
  const s = new StepScheduler({ bpm, steps, onStep: (step, time) => calls.push({ step, time }) })
  return { s, calls }
}

/** Run a fake 25 ms timer from t0 for `seconds` of audio time. */
function run(s: StepScheduler, t0: number, seconds: number, jitter = (_i: number) => 0): number {
  let now = t0
  let i = 0
  const end = t0 + seconds
  while (now < end) {
    s.tick(now)
    now += TICK_MS / 1000 + jitter(i++)
  }
  return now
}

describe('StepScheduler', () => {
  it('computes step duration from bpm (1/16 note)', () => {
    expect(make(120).s.stepDuration).toBeCloseTo(0.125, 12)
    expect(make(60).s.stepDuration).toBeCloseTo(0.25, 12)
  })

  it('does nothing before start', () => {
    const { s, calls } = make()
    expect(s.tick(5)).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('schedules the first steps only inside the look-ahead window', () => {
    const { s, calls } = make(120)
    s.start(1)
    s.tick(1)                       // window [1, 1.1): steps at 1.0 only (next at 1.125)
    expect(calls.map(c => c.time)).toEqual([1])
    s.tick(1.03)                    // window to 1.13: step at 1.125 now due
    expect(calls).toHaveLength(2)
    expect(calls[1].time).toBeCloseTo(1.125, 12)
  })

  it('never schedules a step at or beyond now + look-ahead', () => {
    const { s, calls } = make(140)
    s.start(0)
    let now = 0
    for (let i = 0; i < 400; i++) {
      const before = calls.length
      s.tick(now)
      for (const c of calls.slice(before)) {
        expect(c.time).toBeLessThan(now + LOOKAHEAD_SEC)
        expect(c.time).toBeGreaterThanOrEqual(now - 0.05)
      }
      now += TICK_MS / 1000
    }
  })

  it('schedules each step exactly once, in order, across loops', () => {
    const { s, calls } = make(120, 16)
    s.start(0)
    run(s, 0, 20)                   // 20 s at 8 steps/s = 160 steps = 10 loops
    const times = calls.map(c => c.time)
    expect(new Set(times).size).toBe(times.length)
    calls.forEach((c, n) => expect(c.step).toBe(n % 16))
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
  })

  it('has no drift: step n is exactly start + n * stepDuration', () => {
    const { s, calls } = make(133, 64)
    s.start(0.05)
    run(s, 0, 1500, i => (i % 7) * 0.0007)   // ~25 minutes with irregular timer
    expect(calls.length).toBeGreaterThan(10000)
    calls.forEach((c, n) => expect(c.time).toBe(0.05 + n * s.stepDuration))
  })

  it('skips steps that are more than 50 ms late after a stall, without bursts or repeats', () => {
    const { s, calls } = make(120, 16)
    s.start(0)
    run(s, 0, 1)
    const fired = calls.length
    const lastTime = calls[calls.length - 1].time
    s.tick(10)                      // tab was asleep for ~9 s
    const resumed = calls.slice(fired)
    expect(resumed.length).toBeLessThanOrEqual(2)  // only the steps within [now-50ms, now+100ms)
    for (const c of resumed) {
      expect(c.time).toBeGreaterThan(lastTime)
      expect(c.time).toBeGreaterThanOrEqual(10 - 0.05)
      expect(c.time).toBeLessThan(10 + LOOKAHEAD_SEC)
    }
    const n = calls.length
    s.tick(10)                      // same instant again: nothing new
    expect(calls).toHaveLength(n)
  })

  it('start() resets the position', () => {
    const { s, calls } = make(120, 16)
    s.start(0)
    run(s, 0, 2)
    s.start(100)
    calls.length = 0
    s.tick(100)
    expect(calls[0]).toEqual({ step: 0, time: 100 })
  })

  it('rejects invalid options', () => {
    const f = () => {}
    expect(() => new StepScheduler({ bpm: 0, steps: 16, onStep: f })).toThrow()
    expect(() => new StepScheduler({ bpm: NaN, steps: 16, onStep: f })).toThrow()
    expect(() => new StepScheduler({ bpm: 120, steps: 0, onStep: f })).toThrow()
    expect(() => new StepScheduler({ bpm: 120, steps: 1.5, onStep: f })).toThrow()
  })
})
