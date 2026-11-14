import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { MotionButton, DWELL_MS, DECAY_RATE, updateExclusive, REVERSAL_GRACE_MS } from './motionButton'
import { updateMotionPixels } from '../game/collision'

vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(),
  scaleHitbox: vi.fn((hb: unknown) => hb),
  DIFF_THRESHOLD: 30, HIT_RATIO: 0.15, SAMPLE_STRIDE: 4, MOTION_W: 320, MOTION_H: 180,
}))

function disc(cx: number, cy: number, r: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  const rr = r * 0.9
  for (let y = cy - rr; y <= cy + rr; y += 4) for (let x = cx - rr; x <= cx + rr; x += 4) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) out.push({ x, y })
  }
  return out
}
const frame = (pts: Array<{ x: number; y: number }>, changed = true) =>
  updateMotionPixels({ points: pts, sampled: 100, moved: pts.length, changed }, 320, 180)

/** A pattern is a list of (on?, frames) segments at 33 ms per camera frame. */
const segs = fc.array(fc.record({ on: fc.boolean(), n: fc.integer({ min: 1, max: 30 }) }), { minLength: 1, maxLength: 40 })

describe('MotionButton properties (R2)', () => {
  it('never fires with less than DWELL_MS of on-target time', () => {
    fc.assert(fc.property(segs, (pattern) => {
      const btn = new MotionButton(160, 90, 40, 'x')
      const on = disc(160, 90, 40)
      let t = 0, onMs = 0, fired = false
      for (const s of pattern) for (let i = 0; i < s.n; i++) {
        frame(s.on ? on : [])
        if (s.on) onMs += 33
        if (btn.update(t) === 'triggered') { fired = true; expect(onMs).toBeGreaterThanOrEqual(DWELL_MS - 33) }
        t += 33
      }
      void fired
    }), { numRuns: 300 })
  })

  it('any pattern whose off gaps outweigh its on bursts never fires (sway)', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 12 }), fc.integer({ min: 4, max: 20 }), fc.integer({ min: 1, max: 5 }),
      (onFrames, offFrames, cycles) => {
        // off time beyond the grace drains faster than the on time fills
        fc.pre((offFrames * 33 - REVERSAL_GRACE_MS) * DECAY_RATE >= onFrames * 33)
        const btn = new MotionButton(160, 90, 40, 'x')
        const on = disc(160, 90, 40)
        let t = 0
        for (let c = 0; c < cycles * 10; c++) {
          for (let i = 0; i < onFrames; i++) { frame(on); expect(btn.update(t)).not.toBe('triggered'); t += 33 }
          for (let i = 0; i < offFrames; i++) { frame([]); expect(btn.update(t)).not.toBe('triggered'); t += 33 }
        }
      }), { numRuns: 200 })
  })

  it('duplicate frames never change the fill', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 200 }), (n, dups) => {
      const btn = new MotionButton(160, 90, 40, 'x')
      let t = 0
      for (let i = 0; i < n; i++) { frame(disc(160, 90, 40)); btn.update(t); t += 33 }
      const p = btn.fillProgress()
      for (let i = 0; i < dups; i++) { frame(disc(160, 90, 40), false); btn.update(t); t += 16 }
      expect(btn.fillProgress()).toBe(p)
    }), { numRuns: 200 })
  })

  it('exclusive group fires at most one action per frame', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 5 }), segs, (k, pattern) => {
      const btns = Array.from({ length: k }, () => new MotionButton(160, 90, 40, 'x'))
      const on = disc(160, 90, 40)
      let t = 0
      for (const s of pattern) for (let i = 0; i < s.n; i++) {
        frame(s.on ? on : [])
        const w = updateExclusive(btns, t, true)
        expect(w).toBeGreaterThanOrEqual(-1)
        expect(w).toBeLessThan(k)
        t += 33
      }
    }), { numRuns: 200 })
  })
})
