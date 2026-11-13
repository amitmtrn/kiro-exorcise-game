import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { estimateSwipe, mirrorPoints, centroid, SWIPE_MIN_SHIFT } from './swipe'

const coord = fc.double({ min: -50, max: 400, noNaN: true })
const pt = fc.record({ x: coord, y: coord })
const maybePt = fc.option(pt, { nil: null })
const canvasH = fc.integer({ min: 120, max: 2000 })

describe('swipe estimation (properties)', () => {
  it('always a finite unit vector', () => {
    fc.assert(fc.property(maybePt, maybePt, pt, canvasH, (prev, cur, enemy, h) => {
      const s = estimateSwipe(prev, cur, enemy, h)
      expect(Number.isFinite(s.dx) && Number.isFinite(s.dy) && Number.isFinite(s.mag)).toBe(true)
      expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1, 9)
      expect(s.mag).toBeGreaterThanOrEqual(0)
    }))
  })

  it('mirroring the inputs negates dx and keeps dy', () => {
    fc.assert(fc.property(pt, pt, pt, canvasH, (prev, cur, enemy, h) => {
      const W = 320
      const m = (p: { x: number; y: number }) => ({ x: W - p.x, y: p.y })
      // Mirroring (W - x) rounds differently, so skip inputs sitting on a decision boundary
      // (shift threshold, unit-vector epsilon) where `source` may legitimately flip.
      const shift = Math.hypot(cur.x - prev.x, cur.y - prev.y)
      const radial = Math.hypot(enemy.x - cur.x, enemy.y - cur.y)
      fc.pre(Math.abs(shift - SWIPE_MIN_SHIFT * h) > 1e-6 && radial > 1e-6)
      const a = estimateSwipe(prev, cur, enemy, h)
      const b = estimateSwipe(m(prev), m(cur), m(enemy), h)
      expect(b.source).toBe(a.source)
      expect(b.dx).toBeCloseTo(-a.dx, 6)
      expect(b.dy).toBeCloseTo(a.dy, 6)
    }))
  })

  it('mirrorPoints is an involution', () => {
    fc.assert(fc.property(fc.array(pt, { maxLength: 20 }), (pts) => {
      const twice = mirrorPoints(mirrorPoints(pts, 320), 320)
      twice.forEach((p, i) => {
        expect(p.x).toBeCloseTo(pts[i].x, 9)
        expect(p.y).toBe(pts[i].y)
      })
    }))
  })

  it('a shift larger than the threshold points along cur − prev', () => {
    fc.assert(fc.property(pt, fc.double({ min: 0, max: 6.28, noNaN: true }), fc.double({ min: 25, max: 200, noNaN: true }), (prev, ang, len) => {
      const cur = { x: prev.x + Math.cos(ang) * len, y: prev.y + Math.sin(ang) * len }
      const s = estimateSwipe(prev, cur, { x: 0, y: 0 }, 1000)
      expect(s.source).toBe('shift')
      expect(s.dx).toBeCloseTo(Math.cos(ang), 6)
      expect(s.dy).toBeCloseTo(Math.sin(ang), 6)
    }))
  })

  it('centroid lies within the bounding box of its points', () => {
    fc.assert(fc.property(fc.array(pt, { minLength: 1, maxLength: 30 }), (pts) => {
      const c = centroid(pts)!
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
      expect(c.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6)
      expect(c.x).toBeLessThanOrEqual(Math.max(...xs) + 1e-6)
      expect(c.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6)
      expect(c.y).toBeLessThanOrEqual(Math.max(...ys) + 1e-6)
    }))
  })
})
