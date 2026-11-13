import { describe, it, expect } from 'vitest'
import { motionPointsIn, centroid, mirrorPoints, estimateSwipe, SWIPE_MIN_SHIFT } from './swipe'
import type { Pt } from './swipe'
import { computeMotionMask } from '../webcam/diff'

const W = 320
const H = 180
const BOX = { x: 40, y: 40, w: 240, h: 100 }

/** A black frame with one bright block (a "hand"). */
function frame(bx: number, by: number, bw = 24, bh = 24): ImageData {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue
      const i = (y * W + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
    }
  }
  return { data, width: W, height: H } as ImageData
}

/** Centroids of the two gate frames for a hand moving f0 → f1 → f2. */
function gate(f0: ImageData, f1: ImageData, f2: ImageData): { prev: Pt | null; cur: Pt | null } {
  return {
    prev: centroid(motionPointsIn(f1, f0, BOX, W)),
    cur: centroid(motionPointsIn(f2, f1, BOX, W)),
  }
}

const ENEMY: Pt = { x: 160, y: 90 }

describe('estimateSwipe on synthetic masks', () => {
  it('hand moving right → dx > 0', () => {
    const { prev, cur } = gate(frame(80, 70), frame(110, 70), frame(140, 70))
    const s = estimateSwipe(prev, cur, ENEMY, H)
    expect(s.source).toBe('shift')
    expect(s.dx).toBeGreaterThan(0.99)
    expect(Math.abs(s.dy)).toBeLessThan(0.05)
  })

  it('hand moving left → dx < 0', () => {
    const { prev, cur } = gate(frame(200, 70), frame(170, 70), frame(140, 70))
    const s = estimateSwipe(prev, cur, ENEMY, H)
    expect(s.dx).toBeLessThan(-0.99)
  })

  it('hand moving up → dy < 0 (screen y is down)', () => {
    const { prev, cur } = gate(frame(150, 110), frame(150, 90), frame(150, 70))
    const s = estimateSwipe(prev, cur, ENEMY, H)
    expect(s.dy).toBeLessThan(-0.99)
  })

  it('hand moving down → dy > 0', () => {
    const { prev, cur } = gate(frame(150, 50), frame(150, 70), frame(150, 90))
    expect(estimateSwipe(prev, cur, ENEMY, H).dy).toBeGreaterThan(0.99)
  })

  it('diagonal swipe keeps both components', () => {
    const { prev, cur } = gate(frame(80, 50), frame(110, 70), frame(140, 90))
    const s = estimateSwipe(prev, cur, ENEMY, H)
    expect(s.dx).toBeGreaterThan(0.5)
    expect(s.dy).toBeGreaterThan(0.5)
    expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1, 9)
  })

  it('magnitude is the centroid shift in px', () => {
    const { prev, cur } = gate(frame(80, 70), frame(110, 70), frame(140, 70))
    expect(estimateSwipe(prev, cur, ENEMY, H).mag).toBeCloseTo(30, 0)
  })
})

describe('mirror correctness (R1.3)', () => {
  // Camera space is what the sensor sees. captureFrame mirrors it, so the game
  // sees x → W − x. A hand moving right in the room moves LEFT in the raw feed
  // and RIGHT on screen.
  it('raw-camera leftward motion becomes a rightward swipe after the capture mirror', () => {
    const rawPrev = [{ x: 200, y: 90 }, { x: 204, y: 90 }]
    const rawCur = [{ x: 170, y: 90 }, { x: 174, y: 90 }]
    const raw = estimateSwipe(centroid(rawPrev), centroid(rawCur), ENEMY, H)
    const shown = estimateSwipe(centroid(mirrorPoints(rawPrev, W)), centroid(mirrorPoints(rawCur, W)), ENEMY, H)
    expect(raw.dx).toBeLessThan(0)
    expect(shown.dx).toBeGreaterThan(0)
    expect(shown.dx).toBeCloseTo(-raw.dx, 9)
    expect(shown.dy).toBeCloseTo(raw.dy, 9)
  })

  it('a mirrored frame sequence flips dx and keeps dy', () => {
    const mirrored = (f: ImageData): ImageData => {
      const out = new Uint8ClampedArray(f.data)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = (y * W + x) * 4, d = (y * W + (W - 1 - x)) * 4
        for (let k = 0; k < 4; k++) out[d + k] = f.data[s + k]
      }
      return { data: out, width: W, height: H } as ImageData
    }
    const f = [frame(80, 50), frame(110, 70), frame(140, 90)]
    const a = gate(f[0], f[1], f[2])
    const b = gate(mirrored(f[0]), mirrored(f[1]), mirrored(f[2]))
    const sa = estimateSwipe(a.prev, a.cur, ENEMY, H)
    const sb = estimateSwipe(b.prev, b.cur, ENEMY, H)
    expect(sb.dx).toBeCloseTo(-sa.dx, 6)
    expect(sb.dy).toBeCloseTo(sa.dy, 6)
  })

  it('mirrorPoints twice is the identity', () => {
    const pts = [{ x: 3, y: 4 }, { x: 300, y: 9 }]
    expect(mirrorPoints(mirrorPoints(pts, W), W)).toEqual(pts)
  })
})

describe('fallbacks (R1.2)', () => {
  it('tiny shift → radial away from the hand', () => {
    const s = estimateSwipe({ x: 100, y: 90 }, { x: 100 + SWIPE_MIN_SHIFT * H * 0.5, y: 90 }, { x: 160, y: 90 }, H)
    expect(s.source).toBe('radial')
    expect(s.dx).toBeGreaterThan(0.99)
    expect(s.mag).toBe(0)
  })

  it('no previous centroid → radial', () => {
    const s = estimateSwipe(null, { x: 200, y: 90 }, { x: 160, y: 90 }, H)
    expect(s.source).toBe('radial')
    expect(s.dx).toBeLessThan(-0.99)
  })

  it('hand exactly on the enemy centre → up', () => {
    const s = estimateSwipe(null, { x: 160, y: 90 }, { x: 160, y: 90 }, H)
    expect(s).toEqual({ dx: 0, dy: -1, mag: 0, source: 'default' })
  })

  it('no motion at all → up', () => {
    expect(estimateSwipe(null, null, ENEMY, H).source).toBe('default')
  })
})

describe('motionPointsIn', () => {
  it('matches the whole-frame mask inside the hitbox', () => {
    const f0 = frame(80, 70), f1 = frame(110, 70)
    const inBox = motionPointsIn(f1, f0, BOX, W)
    const mask = computeMotionMask(f1, f0, W, H)
    const expected = mask.points.filter((p) => p.x >= BOX.x && p.x < BOX.x + BOX.w && p.y >= BOX.y && p.y < BOX.y + BOX.h)
    expect(inBox.length).toBe(expected.length)
    expect(inBox.length).toBeGreaterThan(0)
  })

  it('returns nothing for a still scene, off-frame boxes and malformed data', () => {
    const f = frame(80, 70)
    expect(motionPointsIn(f, f, BOX, W)).toEqual([])
    expect(motionPointsIn(frame(0, 0), frame(200, 100), { x: -500, y: -500, w: 100, h: 100 }, W)).toEqual([])
    expect(motionPointsIn({} as ImageData, {} as ImageData, BOX, W)).toEqual([])
  })

  it('centroid of nothing is null', () => {
    expect(centroid([])).toBeNull()
  })
})
