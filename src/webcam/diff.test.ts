import { describe, it, expect } from 'vitest'
import { computeFrameDiff, DIFF_THRESHOLD, HIT_RATIO, SAMPLE_STRIDE } from './diff'
import type { Hitbox } from '../game/state'

/** Build a minimal ImageData-like object for a 10×10 region. */
function makeImageData(width: number, height: number, fillLuminance: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    // All channels equal → luminance ≈ fill value
    data[i] = fillLuminance
    data[i + 1] = fillLuminance
    data[i + 2] = fillLuminance
    data[i + 3] = 255
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
    // Difference of exactly DIFF_THRESHOLD should not count as "moved" (uses >)
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
    // Start with identical frames, then change just one pixel
    const ROWS = 20
    const current = makeImageData(CANVAS_W, ROWS, 128)
    const prev = makeImageData(CANVAS_W, ROWS, 128)
    // Mutate a single pixel well above threshold
    current.data[0] = 255
    current.data[1] = 255
    current.data[2] = 255

    // With stride=4 over a 10×10 box we get ceil(10/4) * ceil(10/4) = 3*3 = 9 samples.
    // 1 out of 9 = ~11% < HIT_RATIO (15%) → should return false.
    expect(computeFrameDiff(current, prev, HITBOX, CANVAS_W)).toBe(false)
  })

  it('respects SAMPLE_STRIDE (exports the constant for external tuning)', () => {
    expect(typeof SAMPLE_STRIDE).toBe('number')
    expect(SAMPLE_STRIDE).toBeGreaterThan(0)
  })

  it('exports DIFF_THRESHOLD and HIT_RATIO as numbers', () => {
    expect(typeof DIFF_THRESHOLD).toBe('number')
    expect(typeof HIT_RATIO).toBe('number')
  })
})
