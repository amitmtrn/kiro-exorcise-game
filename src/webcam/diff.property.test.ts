import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  computeFrameDiff, scaleHitbox, mirrorHitbox, mirrorX, MOTION_W,
} from './diff'
import type { Hitbox } from '../game/state'

const inside = (hb: Hitbox, px: number, py: number) =>
  px >= hb.x && px <= hb.x + hb.w && py >= hb.y && py <= hb.y + hb.h

const hitboxArb = (maxW: number, maxH: number): fc.Arbitrary<Hitbox> => fc.record({
  x: fc.integer({ min: -200, max: maxW }),
  y: fc.integer({ min: -200, max: maxH }),
  w: fc.integer({ min: 1, max: maxW }),
  h: fc.integer({ min: 1, max: maxH }),
})

const realHitboxArb = fc.record({
  x: fc.double({ min: -500, max: 4000, noNaN: true }),
  y: fc.double({ min: -500, max: 2200, noNaN: true }),
  w: fc.double({ min: 1, max: 1000, noNaN: true }),
  h: fc.double({ min: 1, max: 1000, noNaN: true }),
})

describe('mirror parity (properties)', () => {
  it('mirroring a hitbox twice is the identity', () => {
    fc.assert(fc.property(hitboxArb(3840, 2160), fc.integer({ min: 1, max: 3840 }), (hb, W) => {
      expect(mirrorHitbox(mirrorHitbox(hb, W), W)).toEqual(hb)
    }))
    fc.assert(fc.property(realHitboxArb, fc.double({ min: 1, max: 4000, noNaN: true }), (hb, W) => {
      const twice = mirrorHitbox(mirrorHitbox(hb, W), W)
      expect(twice.x).toBeCloseTo(hb.x, 6)
      expect(twice.w).toBe(hb.w)
      expect(twice.y).toBe(hb.y)
      expect(twice.h).toBe(hb.h)
    }))
  })

  it('mirroring a point twice is the identity', () => {
    fc.assert(fc.property(fc.integer({ min: -5000, max: 5000 }), fc.integer({ min: 1, max: 5000 }), (x, W) => {
      expect(mirrorX(mirrorX(x, W), W)).toBe(x)
    }))
  })

  it('a point is in a hitbox iff its mirror is in the mirrored hitbox', () => {
    fc.assert(fc.property(
      hitboxArb(1920, 1080), fc.integer({ min: 1, max: 1920 }),
      fc.integer({ min: -100, max: 2100 }), fc.integer({ min: -100, max: 1200 }),
      (hb, W, px, py) => {
        expect(inside(mirrorHitbox(hb, W), mirrorX(px, W), py)).toBe(inside(hb, px, py))
      },
    ))
  })

  it('mirroring preserves size and vertical placement', () => {
    fc.assert(fc.property(hitboxArb(1920, 1080), fc.integer({ min: 1, max: 1920 }), (hb, W) => {
      const m = mirrorHitbox(hb, W)
      expect([m.y, m.w, m.h]).toEqual([hb.y, hb.w, hb.h])
    }))
  })

  it('mirroring commutes with scaleHitbox (display space ↔ motion space)', () => {
    fc.assert(fc.property(
      realHitboxArb, fc.integer({ min: 320, max: 3840 }), fc.integer({ min: 180, max: 2160 }),
      (hb, DW, DH) => {
        const a = scaleHitbox(mirrorHitbox(hb, DW), DW, DH)
        const b = mirrorHitbox(scaleHitbox(hb, DW, DH), MOTION_W)
        expect(a.x).toBeCloseTo(b.x, 6)
        expect(a.y).toBeCloseTo(b.y, 6)
        expect(a.w).toBeCloseTo(b.w, 6)
        expect(a.h).toBeCloseTo(b.h, 6)
      },
    ))
  })

  it('computeFrameDiff agrees between a frame and its mirror when the hitbox is mirrored', () => {
    // computeFrameDiff samples from the hitbox's left edge with stride 4. The
    // sample set is mirror-symmetric exactly when w ≡ 1 (mod 4), so only such
    // widths are generated.
    const W = 64, H = 32
    const boxArb = fc.record({
      x: fc.integer({ min: 0, max: W - 1 }),
      y: fc.integer({ min: 0, max: H - 1 }),
      n: fc.integer({ min: 1, max: 16 }),
      h: fc.integer({ min: 1, max: H }),
    }).map(({ x, y, n, h }) => {
      const w = Math.min(4 * n - 3, W - x)
      return { x, y, w: w % 4 === 1 ? w : 1 + 4 * Math.floor((w - 1) / 4), h: Math.min(h, H - y) }
    })
    const lumArb = fc.array(fc.constantFrom(0, 255), { minLength: W * H, maxLength: W * H })

    const toImage = (lum: number[]): ImageData => {
      const data = new Uint8ClampedArray(W * H * 4)
      lum.forEach((v, i) => { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255 })
      return { data, width: W, height: H } as ImageData
    }
    const flip = (lum: number[]): number[] =>
      lum.map((_, i) => lum[Math.floor(i / W) * W + (W - 1 - (i % W))])

    fc.assert(fc.property(boxArb, lumArb, lumArb, (hb, cur, prev) => {
      const direct = computeFrameDiff(toImage(cur), toImage(prev), hb, W)
      const mirrored = computeFrameDiff(
        toImage(flip(cur)), toImage(flip(prev)), mirrorHitbox(hb, W), W,
      )
      expect(mirrored).toBe(direct)
    }))
  })
})
