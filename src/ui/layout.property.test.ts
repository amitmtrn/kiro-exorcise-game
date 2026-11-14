import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  buttonLayout, areaButtons, textRects, muteRectOf, soundHintRect, rectsOverlap, circleRect,
  SCREENS_1P, SCREENS_2P, MAX_CENTRE_Y, CENTRE_BAND, buttonRadius,
} from './layout'
import type { ScreenId } from './layout'
import { halfWidth, halfOffset } from '../game/halves'

const ALL: ScreenId[] = [...SCREENS_1P, ...SCREENS_2P]
const size = fc.record({ W: fc.integer({ min: 640, max: 2560 }), H: fc.integer({ min: 480, max: 1440 }) })
const optsArb = fc.record({ hasPhoto: fc.boolean(), noPhoto: fc.boolean() })
const screenArb = fc.constantFrom(...ALL)

describe('layout properties (motion-ui-ergonomics R1, R4, R5, R6)', () => {
  it('centres are at or above 40 % of the height', () => {
    fc.assert(fc.property(size, screenArb, optsArb, ({ W, H }, s, o) => {
      for (const b of buttonLayout(s, W, H, o)) expect(b.cy).toBeLessThanOrEqual(MAX_CENTRE_Y * H)
    }), { numRuns: 400 })
  })

  it('no centre on the body centreline band (1P: 0.5 W; 2P: 0.25 W / 0.75 W)', () => {
    fc.assert(fc.property(size, screenArb, optsArb, ({ W, H }, s, o) => {
      const hw = halfWidth(W)
      for (const b of buttonLayout(s, W, H, o)) {
        const c = b.seat === null ? W / 2 : halfOffset(b.seat, W) + hw / 2
        const aw = b.seat === null ? W : hw
        expect(Math.abs(b.cx - c)).toBeGreaterThanOrEqual(CENTRE_BAND * aw - 1e-9)
      }
    }), { numRuns: 400 })
  })

  it('inside the canvas and inside the owning half', () => {
    fc.assert(fc.property(size, screenArb, optsArb, ({ W, H }, s, o) => {
      const hw = halfWidth(W)
      for (const b of buttonLayout(s, W, H, o)) {
        const lo = b.seat === null ? 0 : halfOffset(b.seat, W)
        const hi = b.seat === null ? W : lo + hw
        expect(b.cx - b.r).toBeGreaterThanOrEqual(lo)
        expect(b.cx + b.r).toBeLessThanOrEqual(hi)
        expect(b.cy - b.r).toBeGreaterThanOrEqual(0)
        expect(b.cy + b.r).toBeLessThanOrEqual(H)
      }
    }), { numRuns: 400 })
  })

  it('gap between any two circles is at least one radius', () => {
    fc.assert(fc.property(size, screenArb, optsArb, ({ W, H }, s, o) => {
      const bs = buttonLayout(s, W, H, o)
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const d = Math.hypot(bs[i].cx - bs[j].cx, bs[i].cy - bs[j].cy)
        expect(d - bs[i].r - bs[j].r).toBeGreaterThanOrEqual(Math.max(bs[i].r, bs[j].r) - 1e-9)
      }
    }), { numRuns: 400 })
  })

  it('no button overlaps a text / banner / card rect or the mute button', () => {
    fc.assert(fc.property(size, screenArb, optsArb, ({ W, H }, s, o) => {
      const text = textRects(s, W, H)
      const mute = muteRectOf(s, W)
      for (const b of buttonLayout(s, W, H, o)) {
        for (const t of text) expect(rectsOverlap(circleRect(b), t)).toBe(false)
        expect(rectsOverlap(circleRect(b), mute)).toBe(false)
      }
    }), { numRuns: 400 })
  })

  it('the sound hint does not intersect any button or mute rect', () => {
    fc.assert(fc.property(size, screenArb, optsArb, ({ W, H }, s, o) => {
      const hint = soundHintRect(W, H)
      expect(hint.x).toBeGreaterThanOrEqual(0)
      expect(hint.x + hint.w).toBeLessThanOrEqual(W)
      for (const b of buttonLayout(s, W, H, o)) expect(rectsOverlap(hint, circleRect(b))).toBe(false)
      expect(rectsOverlap(hint, muteRectOf(s, W))).toBe(false)
    }), { numRuns: 400 })
  })

  it('radii scale with the canvas and stay clamped', () => {
    fc.assert(fc.property(size, ({ W, H }) => {
      const r = buttonRadius(W, H, false)
      expect(r).toBeGreaterThanOrEqual(20)
      expect(r).toBeLessThanOrEqual(80)
      expect(r).toBeLessThanOrEqual(0.07 * H + 1e-9)
    }))
  })

  it('P2 buttons mirror P1 buttons', () => {
    fc.assert(fc.property(size, fc.constantFrom<ScreenId>(...SCREENS_2P), optsArb, ({ W, H }, s, o) => {
      const hw = halfWidth(W)
      const a = areaButtons(s, hw, H, 0, o)
      const b = areaButtons(s, hw, H, 1, o)
      expect(b.map((x) => x.id)).toEqual(a.map((x) => x.id))
      a.forEach((x, i) => {
        expect(b[i].cx).toBeCloseTo(hw - x.cx, 6)
        expect(b[i].cy).toBe(x.cy)
        expect(b[i].r).toBe(x.r)
      })
    }))
  })

  it('destructive buttons are alone in their column (nothing within a column width)', () => {
    fc.assert(fc.property(size, screenArb, optsArb, ({ W, H }, s, o) => {
      const bs = buttonLayout(s, W, H, o)
      for (const d of bs.filter((b) => b.destructive)) {
        for (const other of bs) {
          if (other === d) continue
          expect(Math.hypot(d.cx - other.cx, d.cy - other.cy)).toBeGreaterThanOrEqual(3 * d.r)
        }
        // no neighbour inside one extra radius of its edge
        for (const other of bs) if (other !== d) {
          expect(Math.hypot(d.cx - other.cx, d.cy - other.cy) - d.r - other.r).toBeGreaterThanOrEqual(Math.max(d.r, other.r) - 1e-9)
        }
      }
    }))
  })
})
