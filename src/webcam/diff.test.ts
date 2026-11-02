import { describe, it, expect } from 'vitest'
import { computeFrameDiff, scaleHitbox, DIFF_THRESHOLD, HIT_RATIO, SAMPLE_STRIDE, MOTION_W, MOTION_H, computeMotionMask } from './diff'
import type { Hitbox } from '../game/state'

/** Build a minimal ImageData-like object filled with a uniform luminance. */
function makeImageData(width: number, height: number, fillLuminance: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillLuminance
    data[i + 1] = fillLuminance
    data[i + 2] = fillLuminance
    data[i + 3] = 255
  }
  return { data, width, height } as ImageData
}

/**
 * Build a canvas-sized ImageData (CANVAS_W × CANVAS_H) with a bright region
 * in the LEFT half and a dark region in the RIGHT half.
 * This simulates a mirrored capture where motion happened on the left.
 */
function makeLeftBrightImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const lum = x < width / 2 ? 255 : 0  // left = bright, right = dark
      data[idx] = lum
      data[idx + 1] = lum
      data[idx + 2] = lum
      data[idx + 3] = 255
    }
  }
  return { data, width, height } as ImageData
}

const CANVAS_W = 20
const HITBOX: Hitbox = { x: 0, y: 0, w: 10, h: 10 }

describe('computeFrameDiff', () => {
  it('returns false when all pixels are identical', () => {
    const frame = makeImageData(CANVAS_W, 20, 128)
    expect(computeFrameDiff(frame, frame, HITBOX, CANVAS_W)).toBe(false)
  })

  it('returns true when all pixels are maximally different', () => {
    const current = makeImageData(CANVAS_W, 20, 255)
    const prev = makeImageData(CANVAS_W, 20, 0)
    expect(computeFrameDiff(current, prev, HITBOX, CANVAS_W)).toBe(true)
  })

  it('returns false when the difference is exactly at the threshold (not above)', () => {
    const current = makeImageData(CANVAS_W, 20, DIFF_THRESHOLD)
    const prev = makeImageData(CANVAS_W, 20, 0)
    expect(computeFrameDiff(current, prev, HITBOX, CANVAS_W)).toBe(false)
  })

  it('returns true when difference is one above the threshold across all pixels', () => {
    const current = makeImageData(CANVAS_W, 20, DIFF_THRESHOLD + 1)
    const prev = makeImageData(CANVAS_W, 20, 0)
    expect(computeFrameDiff(current, prev, HITBOX, CANVAS_W)).toBe(true)
  })

  it('returns false when only a tiny fraction of pixels differ (below HIT_RATIO)', () => {
    const current = makeImageData(CANVAS_W, 20, 128)
    const prev = makeImageData(CANVAS_W, 20, 128)
    // Mutate just the first pixel well above threshold
    current.data[0] = 255
    current.data[1] = 255
    current.data[2] = 255
    // 1 out of 9 sampled pixels (~11%) < HIT_RATIO (15%) → false
    expect(computeFrameDiff(current, prev, HITBOX, CANVAS_W)).toBe(false)
  })

  it('exports SAMPLE_STRIDE, HIT_RATIO, MOTION_W, MOTION_H as numbers', () => {
    expect(typeof SAMPLE_STRIDE).toBe('number')
    expect(SAMPLE_STRIDE).toBeGreaterThan(0)
    expect(typeof HIT_RATIO).toBe('number')
    expect(typeof MOTION_W).toBe('number')
    expect(typeof MOTION_H).toBe('number')
  })
})

describe('mirror parity — captureFrame coordinate alignment', () => {
  /**
   * After a mirrored draw, the left half of the canvas corresponds to the
   * player's left hand. Motion on the left of the current frame vs a dark
   * previous frame should register a hit on a LEFT hitbox, not a RIGHT hitbox.
   */
  it('detects motion on the LEFT when the bright region is on the left', () => {
    const W = 40
    const H = 20

    // "current" frame: left half bright (motion on left)
    const current = makeLeftBrightImageData(W, H)
    // "prev" frame: all dark (no motion previously)
    const prev = makeImageData(W, H, 0)

    const leftHitbox: Hitbox = { x: 0, y: 0, w: W / 2, h: H }
    const rightHitbox: Hitbox = { x: W / 2, y: 0, w: W / 2, h: H }

    expect(computeFrameDiff(current, prev, leftHitbox, W)).toBe(true)
    expect(computeFrameDiff(current, prev, rightHitbox, W)).toBe(false)
  })

  it('detects motion on the RIGHT when the bright region is on the right', () => {
    const W = 40
    const H = 20
    const data = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4
        const lum = x >= W / 2 ? 255 : 0
        data[idx] = data[idx + 1] = data[idx + 2] = lum
        data[idx + 3] = 255
      }
    }
    const current = { data, width: W, height: H } as ImageData
    const prev = makeImageData(W, H, 0)

    const leftHitbox: Hitbox = { x: 0, y: 0, w: W / 2, h: H }
    const rightHitbox: Hitbox = { x: W / 2, y: 0, w: W / 2, h: H }

    expect(computeFrameDiff(current, prev, leftHitbox, W)).toBe(false)
    expect(computeFrameDiff(current, prev, rightHitbox, W)).toBe(true)
  })
})

describe('scaleHitbox', () => {
  it('scales hitbox coordinates from display to motion canvas space', () => {
    const hitbox: Hitbox = { x: 320, y: 90, w: 80, h: 80 }
    const scaled = scaleHitbox(hitbox, 640, 360)
    expect(scaled.x).toBeCloseTo(160)
    expect(scaled.y).toBeCloseTo(45)
    expect(scaled.w).toBeCloseTo(40)
    expect(scaled.h).toBeCloseTo(40)
  })

  it('is a no-op when display size equals motion canvas size', () => {
    const hitbox: Hitbox = { x: 10, y: 10, w: 50, h: 30 }
    const scaled = scaleHitbox(hitbox, MOTION_W, MOTION_H)
    expect(scaled.x).toBeCloseTo(10)
    expect(scaled.y).toBeCloseTo(10)
    expect(scaled.w).toBeCloseTo(50)
    expect(scaled.h).toBeCloseTo(30)
  })
})

// ─── computeMotionMask ────────────────────────────────────────────────────────

describe('computeMotionMask — whole-frame mask + new-frame detection', () => {
  const W = 32, H = 16
  const frame = (fill: number) => ({ data: new Uint8ClampedArray(W * H * 4).fill(fill), width: W, height: H } as unknown as ImageData)

  it('identical frames: changed=false, nothing moved', () => {
    const m = computeMotionMask(frame(100), frame(100), W, H, 4)
    expect(m.changed).toBe(false)
    expect(m.moved).toBe(0)
    expect(m.points).toHaveLength(0)
    expect(m.sampled).toBe((W / 4) * (H / 4))
  })

  it('sensor noise below threshold: changed=true but nothing moved', () => {
    const m = computeMotionMask(frame(100), frame(103), W, H, 4)
    expect(m.changed).toBe(true)
    expect(m.moved).toBe(0)
  })

  it('a bright block reports moved points only inside the block', () => {
    const cur = frame(40), prv = frame(40)
    // Block covering x 16..31, y 0..7
    for (let y = 0; y < 8; y++) for (let x = 16; x < W; x++) {
      const i = (y * W + x) * 4
      cur.data[i] = cur.data[i + 1] = cur.data[i + 2] = 220
    }
    const m = computeMotionMask(cur, prv, W, H, 4)
    expect(m.changed).toBe(true)
    expect(m.moved).toBe(4 * 2) // 4 sampled columns × 2 sampled rows
    for (const p of m.points) {
      expect(p.x).toBeGreaterThanOrEqual(16)
      expect(p.y).toBeLessThan(8)
    }
  })
})
