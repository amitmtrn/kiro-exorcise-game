import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  layoutCard, buildCardTexts, fitText, coverRect, estimateWidth, textExtent,
  MIN_CARD_W, MIN_CARD_H, type Rect, type TextBox,
} from './layout'

const inside = (r: Rect, w: number, h: number) =>
  r.x >= 0 && r.y >= 0 && r.w >= 0 && r.h >= 0 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9

const textInside = (t: TextBox, w: number, h: number) => {
  const e = textExtent(t)
  return e.left >= -1e-9 && e.right <= w + 1e-9 && t.y - t.px * 0.6 >= -1e-9 && t.y + t.px * 0.6 <= h + 1e-9
}

const anyText = fc.oneof(
  fc.string({ maxLength: 120 }),
  fc.string({ unit: 'grapheme', maxLength: 60 }),
  fc.constant('W'.repeat(300)),
)

describe('card layout (properties)', () => {
  it('every rect and text extent stays inside the card for any size and text length', () => {
    fc.assert(fc.property(
      fc.integer({ min: MIN_CARD_W, max: 4000 }),
      fc.integer({ min: MIN_CARD_H, max: 4000 }),
      fc.double({ min: -1e12, max: 1e15, noNaN: true }),
      fc.double({ min: -5, max: 1e6, noNaN: true }),
      fc.integer({ min: 0, max: 1e9 }),
      anyText,
      (w, h, score, combo, banished, rank) => {
        const L = layoutCard(w, h, buildCardTexts({ score, bestCombo: combo, stage: 5, stageCount: 5, banished, rank }))
        expect(inside(L.frameOuter, w, h)).toBe(true)
        expect(inside(L.frameInner, w, h)).toBe(true)
        expect(inside(L.photo, w, h)).toBe(true)
        const boxes = [L.title, L.rank, L.footer, ...L.rows.flatMap((r) => [r.label, r.value])]
        for (const b of boxes) expect(textInside(b, w, h)).toBe(true)
      },
    ), { numRuns: 300 })
  })

  it('also holds for arbitrary row labels and values', () => {
    fc.assert(fc.property(
      fc.integer({ min: MIN_CARD_W, max: 2000 }),
      fc.integer({ min: MIN_CARD_H, max: 2000 }),
      fc.array(fc.record({ label: anyText, value: anyText }), { minLength: 1, maxLength: 4 }),
      anyText,
      (w, h, rows, rank) => {
        const L = layoutCard(w, h, { title: 'EXORCIST', rank, rows, footer: 'f' })
        for (const r of L.rows) {
          expect(textInside(r.label, w, h)).toBe(true)
          expect(textInside(r.value, w, h)).toBe(true)
        }
      },
    ), { numRuns: 200 })
  })

  it('fitText output always fits maxW', () => {
    fc.assert(fc.property(anyText, fc.double({ min: 0, max: 2000, noNaN: true }), fc.double({ min: 4, max: 200, noNaN: true }), (text, maxW, base) => {
      const r = fitText(text, maxW, base, Math.min(10, base))
      expect(estimateWidth(r.text, r.px)).toBeLessThanOrEqual(maxW + 1e-9)
    }))
  })

  it('coverRect stays inside the source and matches the destination aspect', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 1, max: 4000 }),
      fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 1, max: 4000 }),
      (sw, sh, dw, dh) => {
        const r = coverRect(sw, sh, dw, dh)
        expect(r.x).toBeGreaterThanOrEqual(-1e-9)
        expect(r.y).toBeGreaterThanOrEqual(-1e-9)
        expect(r.x + r.w).toBeLessThanOrEqual(sw + 1e-6)
        expect(r.y + r.h).toBeLessThanOrEqual(sh + 1e-6)
        expect(r.w / r.h).toBeCloseTo(dw / dh, 5)
      },
    ))
  })
})
