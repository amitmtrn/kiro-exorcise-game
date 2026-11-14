import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  simulateWaveform, maxFlashesPerWindow, overlayAlpha, REDUCED_ALPHA, NORMAL_ALPHA, MAX_FLASHES_PER_S, RAMP_MS,
} from './flash'

const requests = fc.array(
  fc.record({ gap: fc.integer({ min: 0, max: 600 }), durMs: fc.integer({ min: 20, max: 800 }), alpha: fc.double({ min: 0.05, max: 1, noNaN: true }) }),
  { minLength: 1, maxLength: 40 },
).map((rs) => { let t = 0; return rs.map((r) => { t += r.gap; return { at: t, durMs: r.durMs, alpha: r.alpha } }) })

describe('flash scheduler properties (R10.2)', () => {
  it('never more than 3 flashes in any 1000 ms window, whatever the request stream', () => {
    fc.assert(fc.property(requests, (reqs) => {
      const wave = simulateWaveform(reqs, -50, reqs[reqs.length - 1].at + 2000)
      return maxFlashesPerWindow(wave) <= MAX_FLASHES_PER_S
    }), { numRuns: 200 })
  })

  it('alpha stays between 0 and the reduced cap', () => {
    fc.assert(fc.property(requests, (reqs) => {
      const wave = simulateWaveform(reqs, -50, reqs[reqs.length - 1].at + 1500, 3)
      return wave.every((a) => a >= 0 && a <= REDUCED_ALPHA + 1e-12)
    }), { numRuns: 100 })
  })

  it('the waveform has no hard edges', () => {
    fc.assert(fc.property(requests, (reqs) => {
      const wave = simulateWaveform(reqs, -50, reqs[reqs.length - 1].at + 1500)
      for (let i = 1; i < wave.length; i++) if (Math.abs(wave[i] - wave[i - 1]) > REDUCED_ALPHA / RAMP_MS + 1e-9) return false
      return true
    }), { numRuns: 60 })
  })

  it('the renderer path (a new flashEndTime per hit) obeys the same rule', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 400 }), { minLength: 1, maxLength: 40 }), (gaps) => {
      const key = {}
      const hits: number[] = []
      let t = 0
      for (const g of gaps) { t += g; hits.push(t) }
      const total = t + 1000
      const wave: number[] = []
      let end = 0, next = 0
      for (let ms = 0; ms < total; ms++) {
        while (next < hits.length && hits[next] <= ms) { end = hits[next] + 300; next++ }
        wave.push(overlayAlpha(key, end, ms, true))
      }
      return maxFlashesPerWindow(wave) <= MAX_FLASHES_PER_S && wave.every((a) => a <= REDUCED_ALPHA + 1e-12)
    }), { numRuns: 60 })
  })

  it('the normal flash constant is unchanged and higher than the reduced one', () => {
    expect(NORMAL_ALPHA).toBe(0.4)
    expect(REDUCED_ALPHA).toBeLessThan(NORMAL_ALPHA)
  })
})
