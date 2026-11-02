import { describe, it, expect } from 'vitest'
import { hudFontSize, comboPulseScale, muteButtonRect, COMBO_PULSE_MS } from './hud'

describe('hudFontSize (spooky-skin R5.1)', () => {
  it('scales with canvas width at W / 20', () => {
    expect(hudFontSize(800)).toBe(40)
    expect(hudFontSize(600)).toBe(30)
  })

  it('clamps to [24, 48]', () => {
    expect(hudFontSize(100)).toBe(24)
    expect(hudFontSize(320)).toBe(24)
    expect(hudFontSize(1920)).toBe(48)
    expect(hudFontSize(4000)).toBe(48)
  })
})

describe('comboPulseScale', () => {
  it('starts at 1.5 and eases back to 1 over COMBO_PULSE_MS', () => {
    expect(comboPulseScale(0)).toBeCloseTo(1.5)
    expect(comboPulseScale(COMBO_PULSE_MS / 2)).toBeCloseTo(1.25)
    expect(comboPulseScale(COMBO_PULSE_MS)).toBe(1)
    expect(comboPulseScale(10_000)).toBe(1)
  })

  it('is 1 before any increment (negative / -Infinity elapsed)', () => {
    expect(comboPulseScale(-1)).toBe(1)
    expect(comboPulseScale(Number.NEGATIVE_INFINITY)).toBe(1)
  })
})

describe('muteButtonRect', () => {
  it('sits in the top-right corner inside the canvas', () => {
    const W = 1280
    const r = muteButtonRect(W, hudFontSize(W))
    expect(r.x + r.w).toBeLessThanOrEqual(W)
    expect(r.x).toBeGreaterThan(W * 0.8)
    expect(r.y).toBeLessThan(150)
    expect(r.w).toBeGreaterThanOrEqual(24) // comfortable tap target
    expect(r.h).toBe(r.w)
  })
})
