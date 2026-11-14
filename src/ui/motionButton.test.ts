import { describe, it, expect, vi } from 'vitest'
import {
  MotionButton, DWELL_MS, DESTRUCTIVE_DWELL_MS, MIN_MOTION_PIXELS, MAX_FRAME_GAP_MS,
  RELEASE_STILL_MS, ENTRY_LOCK_MS, EntryLock, updateExclusive,
} from './motionButton'
import { updateMotionPixels } from '../game/collision'

vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(),
  scaleHitbox: vi.fn((hb: unknown) => hb),
  DIFF_THRESHOLD: 30, HIT_RATIO: 0.15, SAMPLE_STRIDE: 4, MOTION_W: 320, MOTION_H: 180,
}))

/** Grid points (4 px cells, like the real mask on a 320×180 canvas) covering `frac` of a circle. */
export function disc(cx: number, cy: number, r: number, frac = 0.8): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  const rr = r * Math.sqrt(frac)
  for (let y = cy - rr; y <= cy + rr; y += 4) for (let x = cx - rr; x <= cx + rr; x += 4) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) out.push({ x, y })
  }
  return out
}
/** Publish a new camera frame. */
function frame(points: Array<{ x: number; y: number }>, changed = true) {
  updateMotionPixels({ points, sampled: 100, moved: points.length, changed }, 320, 180)
}
const FRAME_MS = 33

/** Runs frames of `on`/off motion from t0 for `ms`; returns the final time and whether it ever triggered. */
function run(btn: MotionButton, t0: number, ms: number, on: boolean, gated = true) {
  const pts = on ? disc(btn.cx, btn.cy, btn.radius) : []
  let t = t0, fired = false
  for (; t < t0 + ms; t += FRAME_MS) {
    frame(pts)
    if (btn.updateGated(t, gated) === 'triggered') fired = true
  }
  return { t, fired }
}

describe('MotionButton activation (motion-ui-ergonomics R2)', () => {
  it('fills while a hand covers the circle and triggers after ~DWELL_MS', () => {
    const btn = new MotionButton(160, 90, 40, 'START')
    const a = run(btn, 0, DWELL_MS - 100, true)
    expect(a.fired).toBe(false)
    expect(btn.fillProgress()).toBeGreaterThan(0.5)
    expect(run(btn, a.t, 300, true).fired).toBe(true)
  })

  it('a single frame never fires', () => {
    const btn = new MotionButton(160, 90, 40, 'START')
    frame(disc(160, 90, 40))
    expect(btn.update(0)).not.toBe('triggered')
    frame([])
    expect(btn.update(33)).not.toBe('triggered')
  })

  it('noise below the coverage threshold never fills', () => {
    const btn = new MotionButton(160, 90, 40, 'START')
    const r = run(btn, 0, 5000, true)
    expect(r.fired).toBe(true) // sanity: a real hand does
    const noisy = new MotionButton(160, 90, 40, 'START')
    const few = disc(160, 90, 40, 0.05) // ~5 % of the circle: a sleeve / finger
    let fired = false
    for (let t = 0; t < 5000; t += FRAME_MS) { frame(few); if (noisy.update(t) === 'triggered') fired = true }
    expect(fired).toBe(false)
    expect(noisy.fillProgress()).toBe(0)
  })

  it('needs at least MIN_MOTION_PIXELS samples even on a tiny circle', () => {
    const btn = new MotionButton(160, 90, 4, 'x')
    for (let t = 0; t < 3000; t += FRAME_MS) {
      frame([{ x: 160, y: 90 }, { x: 161, y: 90 }].slice(0, MIN_MOTION_PIXELS - 1))
      expect(btn.update(t)).not.toBe('triggered')
    }
  })

  it('drains faster than it fills, so a sway pattern never fires', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    let t = 0, fired = false
    for (let i = 0; i < 40; i++) {
      const on = run(btn, t, 300, true); t = on.t; fired ||= on.fired
      const off = run(btn, t, 300, false); t = off.t; fired ||= off.fired
    }
    expect(fired).toBe(false)
  })

  it('keeps filling through a short reversal gap', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    let t = run(btn, 0, 400, true).t
    t = run(btn, t, 70, false).t
    const p = btn.fillProgress()
    expect(p).toBeGreaterThan(0.3)
    expect(run(btn, t, 500, true).fired).toBe(true)
  })

  it('drains partially instead of resetting to zero', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    let t = run(btn, 0, 500, true).t
    const before = btn.fillProgress()
    t = run(btn, t, 200, false).t
    const after = btn.fillProgress()
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(0)
  })

  it('destructive buttons need the longer dwell', () => {
    const btn = new MotionButton(160, 90, 40, 'SAVE', null, DESTRUCTIVE_DWELL_MS)
    expect(run(btn, 0, DWELL_MS + 150, true).fired).toBe(false)
    const b2 = new MotionButton(160, 90, 40, 'SAVE', null, DESTRUCTIVE_DWELL_MS)
    expect(run(b2, 0, DESTRUCTIVE_DWELL_MS + 200, true).fired).toBe(true)
  })
})

describe('duplicate camera frames (R2.4)', () => {
  it('stale points never keep a button filling', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    frame(disc(160, 90, 40)); btn.update(0)
    frame(disc(160, 90, 40)); btn.update(33)
    const p = btn.fillProgress()
    for (let t = 66; t < 5000; t += 16) {
      frame([], false) // duplicate: the points stay, the sequence does not move
      expect(btn.update(t)).not.toBe('triggered')
    }
    expect(btn.fillProgress()).toBe(p)
  })

  it('a long camera stall credits at most MAX_FRAME_GAP_MS', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    frame(disc(160, 90, 40)); btn.update(0)
    frame(disc(160, 90, 40)); btn.update(33)
    const p0 = btn.fillProgress() * DWELL_MS
    frame(disc(160, 90, 40)); btn.update(10_000)
    expect(btn.fillProgress() * DWELL_MS - p0).toBeLessThanOrEqual(MAX_FRAME_GAP_MS + 1e-6)
  })

  it('alternating real and duplicate ticks (30 fps camera at 60 Hz) still fills in time', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    let fired = false
    for (let t = 0; t < DWELL_MS + 300; t += 16) {
      const fresh = Math.round(t / 16) % 2 === 0
      frame(disc(160, 90, 40), fresh)
      if (btn.update(t) === 'triggered') fired = true
    }
    expect(fired).toBe(true)
  })
})

describe('one wave = one trigger, latch and lockout (R2.5, R2.6)', () => {
  it('does not re-trigger while the hand keeps waving', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    const a = run(btn, 0, 2000, true)
    expect(a.fired).toBe(true)
    expect(run(btn, a.t, 3000, true).fired).toBe(false)
  })

  it('re-arms once the motion has left for longer than RELEASE_STILL_MS', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    let t = run(btn, 0, 2000, true).t
    t = run(btn, t, RELEASE_STILL_MS + 100, false).t
    expect(run(btn, t, 2000, true).fired).toBe(true)
  })

  it('updateGated(false) ignores motion and the hand must leave before filling', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    let t = run(btn, 0, 3000, true, false).t // not live the whole time
    expect(run(btn, t, 3000, true).fired).toBe(false) // live, hand still there: held
    t = run(btn, t + 3000, RELEASE_STILL_MS + 100, false).t
    expect(run(btn, t, 2000, true).fired).toBe(true)
  })

  it('reset drops a partial fill and the latch', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    run(btn, 0, 400, true)
    btn.reset()
    expect(btn.fillProgress()).toBe(0)
  })

  it('EntryLock is live ENTRY_LOCK_MS after the first touch and restarts on reset', () => {
    const lock = new EntryLock()
    expect(lock.touch(1000)).toBe(false)
    expect(lock.touch(1000 + ENTRY_LOCK_MS - 1)).toBe(false)
    expect(lock.touch(1000 + ENTRY_LOCK_MS)).toBe(true)
    lock.reset()
    expect(lock.touch(9000)).toBe(false)
  })

  it('a wave that continues through the entry lockout does not fire when it ends', () => {
    const btn = new MotionButton(160, 90, 40, 'x')
    const lock = new EntryLock()
    let fired = false, t = 0
    for (; t < ENTRY_LOCK_MS + 3000; t += FRAME_MS) {
      frame(disc(160, 90, 40))
      if (btn.updateGated(t, lock.touch(t)) === 'triggered') fired = true
    }
    expect(fired).toBe(false)
  })
})

describe('updateExclusive (R2.7)', () => {
  it('fires exactly one of two buttons that fill on the same frame, the first in priority order', () => {
    const a = new MotionButton(100, 90, 40, 'a')
    const b = new MotionButton(100, 90, 40, 'b') // same spot: both fill together
    let winners: number[] = []
    for (let t = 0; t < 3000; t += FRAME_MS) {
      frame(disc(100, 90, 40))
      const w = updateExclusive([a, b], t, true)
      if (w >= 0) winners.push(w)
    }
    expect(winners).toEqual([0])
  })

  it('the loser is latched: it does not fire on the next frames either', () => {
    const a = new MotionButton(100, 90, 40, 'a')
    const b = new MotionButton(100, 90, 40, 'b')
    const fired: number[] = []
    for (let t = 0; t < 6000; t += FRAME_MS) {
      frame(disc(100, 90, 40))
      const w = updateExclusive([a, b], t, true)
      if (w >= 0) fired.push(w)
    }
    expect(fired.length).toBe(1)
  })

  it('per-button live flags: a not-live button never wins', () => {
    const a = new MotionButton(100, 90, 40, 'a')
    const b = new MotionButton(100, 90, 40, 'b')
    const fired: number[] = []
    for (let t = 0; t < 3000; t += FRAME_MS) {
      frame(disc(100, 90, 40))
      const w = updateExclusive([a, b], t, [false, true])
      if (w >= 0) fired.push(w)
    }
    expect(fired).toEqual([1])
  })
})

describe('point source (two-player-card R1.3)', () => {
  it('reads only its own points when a source is given, ignoring the whole-frame mask', () => {
    const pts = disc(100, 100, 40)
    const own = new MotionButton(100, 100, 40, 'x', () => pts)
    const global = new MotionButton(100, 100, 40, 'x')
    const far = new MotionButton(100, 100, 40, 'x', () => pts.map((p) => ({ x: p.x + 500, y: p.y })))
    let ownFired = false, globalFired = false, farFired = false
    for (let t = 0; t < 2000; t += FRAME_MS) {
      frame([]) // the global mask is empty
      if (own.update(t) === 'triggered') ownFired = true
      if (global.update(t) === 'triggered') globalFired = true
      if (far.update(t) === 'triggered') farFired = true
    }
    expect(ownFired).toBe(true)
    expect(globalFired).toBe(false)
    expect(farFired).toBe(false)
  })
})

describe('label fit (motion-ui-ergonomics R5.1)', () => {
  it('shrinks the label to the circle width at small radii', () => {
    let font = ''
    const widths: number[] = []
    const ctx = new Proxy({}, {
      get: (t: any, k) => (k === 'fillText' ? (s: string) => widths.push(s.length) : typeof t[k] === 'undefined' ? () => {} : t[k]),
      set: (t: any, k, v) => { if (k === 'font') font = v; t[k] = v; return true },
    }) as unknown as CanvasRenderingContext2D
    new MotionButton(38, 100, 28, '📸 EXORCIST').render(ctx, 0)
    const px = Number(/(\d+)px/.exec(font)![1])
    expect(px * 0.6 * 11).toBeLessThanOrEqual(2 * 28 + 6)
  })
})
