import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { cropMotionHalf, seatOfX, seatOfRawColumn, toHalfPoints } from './halves'
import type { Seat } from './halves'
import { computeFrameDiff, scaleHitbox, mirrorX, MOTION_W, MOTION_H } from '../webcam/diff'
import { resolveHits } from './collision'
import { createInitialState, makeEnemy } from './state'
import type { GameState } from './state'

vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxSkullHit: vi.fn(),
  sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(), sfxCombo: vi.fn(),
}))

type Rect = { x: number; y: number; w: number; h: number }

/** prev = black, cur = white inside `rects` (motion-canvas coords). */
function frames(rects: Rect[]): { cur: ImageData; prev: ImageData } {
  const cur = new Uint8ClampedArray(MOTION_W * MOTION_H * 4)
  const prev = new Uint8ClampedArray(MOTION_W * MOTION_H * 4)
  for (const r of rects) {
    for (let y = Math.max(0, r.y); y < Math.min(MOTION_H, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(MOTION_W, r.x + r.w); x++) {
        const i = (y * MOTION_W + x) * 4
        cur[i] = cur[i + 1] = cur[i + 2] = 255
      }
    }
  }
  const mk = (d: Uint8ClampedArray) => ({ data: d, width: MOTION_W, height: MOTION_H }) as unknown as ImageData
  return { cur: mk(cur), prev: mk(prev) }
}

const rectArb = (xMin: number, xMax: number): fc.Arbitrary<Rect> =>
  fc.record({
    x: fc.integer({ min: xMin, max: xMax }),
    y: fc.integer({ min: -20, max: MOTION_H }),
    w: fc.integer({ min: 1, max: 160 }),
    h: fc.integer({ min: 1, max: MOTION_H }),
  })

const hitboxArb = fc.record({
  x: fc.integer({ min: -200, max: 700 }),
  y: fc.integer({ min: -100, max: 400 }),
  w: fc.integer({ min: 10, max: 400 }),
  h: fc.integer({ min: 10, max: 300 }),
})

const HALF_W = 640, H = 360

describe('two-player — no cross-half hits (property)', () => {
  it('motion only in the OTHER half never trips a seat\'s frame diff, whatever the hitbox', () => {
    fc.assert(fc.property(
      fc.constantFrom<Seat>(0, 1),
      fc.array(rectArb(0, MOTION_W), { maxLength: 6 }),
      hitboxArb,
      (seat, rects, hb) => {
        const other: Seat = seat === 0 ? 1 : 0
        // clip every rect to the other half's columns
        const lo = other * 160, hi = lo + 160
        const clipped = rects
          .map((r) => ({ ...r, x: Math.max(r.x, lo), w: Math.min(r.x + r.w, hi) - Math.max(r.x, lo) }))
          .filter((r) => r.w > 0)
        const { cur, prev } = frames(clipped)
        const hit = computeFrameDiff(
          cropMotionHalf(cur, seat), cropMotionHalf(prev, seat),
          scaleHitbox(hb, HALF_W, H, 160), 160,
        )
        expect(hit).toBe(false)
      },
    ))
  })

  it('a seat\'s diff is exactly the same as if the other half were completely still', () => {
    fc.assert(fc.property(
      fc.constantFrom<Seat>(0, 1),
      fc.array(rectArb(0, MOTION_W), { maxLength: 6 }),
      fc.array(rectArb(0, MOTION_W), { maxLength: 6 }),
      hitboxArb,
      (seat, rects, noiseElsewhere, hb) => {
        const lo = seat * 160, hi = lo + 160
        const inside = (rs: Rect[]) => rs
          .map((r) => ({ ...r, x: Math.max(r.x, lo), w: Math.min(r.x + r.w, hi) - Math.max(r.x, lo) }))
          .filter((r) => r.w > 0)
        const other: Seat = seat === 0 ? 1 : 0
        const olo = other * 160, ohi = olo + 160
        const outside = noiseElsewhere
          .map((r) => ({ ...r, x: Math.max(r.x, olo), w: Math.min(r.x + r.w, ohi) - Math.max(r.x, olo) }))
          .filter((r) => r.w > 0)
        const a = frames(inside(rects))
        const b = frames([...inside(rects), ...outside])
        const sb = scaleHitbox(hb, HALF_W, H, 160)
        const ra = computeFrameDiff(cropMotionHalf(a.cur, seat), cropMotionHalf(a.prev, seat), sb, 160)
        const rb = computeFrameDiff(cropMotionHalf(b.cur, seat), cropMotionHalf(b.prev, seat), sb, 160)
        expect(rb).toBe(ra)
      },
    ))
  })

  it('resolveHits: motion in the other half never banishes this seat\'s enemy', () => {
    fc.assert(fc.property(
      fc.constantFrom<Seat>(0, 1),
      fc.array(rectArb(0, MOTION_W), { minLength: 1, maxLength: 5 }),
      fc.integer({ min: 0, max: HALF_W }),
      fc.integer({ min: 0, max: H }),
      (seat, rects, ex, ey) => {
        const other: Seat = seat === 0 ? 1 : 0
        const lo = other * 160, hi = lo + 160
        const clipped = rects
          .map((r) => ({ ...r, x: Math.max(r.x, lo), w: Math.min(r.x + r.w, hi) - Math.max(r.x, lo) }))
          .filter((r) => r.w > 0)
        const { cur, prev } = frames(clipped)
        const c = cropMotionHalf(cur, seat), p = cropMotionHalf(prev, seat)
        const ghost = makeEnemy({
          id: 'g', type: 'ghost', x: ex, y: ey, targetX: HALF_W / 2, targetY: H / 2, speed: 0.2,
          hitbox: { x: ex - 40, y: ey - 40, w: 80, h: 80 }, spawnedAt: 0, hitCount: 1,
        })
        let s: GameState = { ...createInitialState(), phase: 'playing', enemies: [ghost] }
        s = resolveHits(s, c, p, HALF_W, H, 10_000, true, 16, 160)
        expect(s.enemies).toHaveLength(1)
        expect(s.score).toBe(0)
      },
    ))
  })

  it('ownership partitions the screen and the raw mapping is the mirror of it', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1919 }), fc.integer({ min: 2, max: 1920 }), (col, rawW) => {
      const c = col % rawW
      const seat = seatOfRawColumn(c, rawW)
      expect(seat).toBe(seatOfX(mirrorX(c + 0.5, rawW), rawW))
      expect([0, 1]).toContain(seat)
      // mirrored column ordering: a column further right in the raw image never moves to a higher seat
      if (c + 1 < rawW) expect(seatOfRawColumn(c + 1, rawW)).toBeLessThanOrEqual(seat)
    }))
  })

  it('toHalfPoints partitions a mask: every point is in exactly one seat, x stays inside 0..159', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ x: fc.integer({ min: 0, max: MOTION_W - 1 }), y: fc.integer({ min: 0, max: MOTION_H - 1 }) }), { maxLength: 100 }),
      (pts) => {
        const a = toHalfPoints(pts, 0), b = toHalfPoints(pts, 1)
        expect(a.length + b.length).toBe(pts.length)
        for (const p of [...a, ...b]) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThan(160) }
      },
    ))
  })
})
