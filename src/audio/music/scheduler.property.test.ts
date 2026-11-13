import { describe, it } from 'vitest'
import fc from 'fast-check'
import { StepScheduler, LOOKAHEAD_SEC } from './scheduler'

describe('StepScheduler properties', () => {
  it('any non-decreasing tick sequence: times strictly increase, none repeated, none past the window', () => {
    fc.assert(fc.property(
      fc.integer({ min: 60, max: 160 }),
      fc.integer({ min: 1, max: 8 }).map(b => b * 16),
      fc.array(fc.double({ min: 0, max: 0.5, noNaN: true }), { minLength: 1, maxLength: 200 }),
      (bpm, steps, deltas) => {
        const calls: Array<{ step: number; time: number }> = []
        const s = new StepScheduler({ bpm, steps, onStep: (step, time) => calls.push({ step, time }) })
        s.start(0)
        let now = 0
        for (const d of deltas) {
          now += d
          const before = calls.length
          s.tick(now)
          for (const c of calls.slice(before)) {
            if (!(c.time < now + LOOKAHEAD_SEC)) throw new Error('past window')
          }
        }
        for (let i = 1; i < calls.length; i++) {
          if (!(calls[i].time > calls[i - 1].time)) throw new Error('not increasing')
        }
        calls.forEach(c => { if (c.step < 0 || c.step >= steps) throw new Error('bad step') })
        // step index follows absolute time, so no step is played twice
        calls.forEach(c => {
          const n = Math.round(c.time / s.stepDuration)
          if (c.step !== n % steps) throw new Error('index mismatch')
        })
      },
    ))
  })

  it('with ticks at most 50 ms apart nothing is ever skipped', () => {
    fc.assert(fc.property(
      fc.integer({ min: 60, max: 160 }),
      fc.array(fc.double({ min: 0, max: 0.05, noNaN: true }), { minLength: 10, maxLength: 300 }),
      (bpm, deltas) => {
        const times: number[] = []
        const s = new StepScheduler({ bpm, steps: 16, onStep: (_st, t) => times.push(t) })
        s.start(0)
        let now = 0
        for (const d of deltas) { now += d; s.tick(now) }
        times.forEach((t, n) => { if (t !== n * s.stepDuration) throw new Error('gap') })
      },
    ))
  })
})
