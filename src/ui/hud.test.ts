import { describe, it, expect, vi } from 'vitest'
vi.mock('../audio/index', () => ({ isMuted: () => false }))
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

// ─── Two-player HUD (two-player R2.4) ─────────────────────────────────────────

import { muteButtonRect2P, createHudPulse, renderHUD } from './hud'
import { createInitialState } from '../game/state'

/** Recording canvas context: every method is a no-op that logs the text it was asked to draw. */
function recorder(w = 640, h = 720) {
  const texts: string[] = []
  const props: Record<string, unknown> = {}
  const ctx = new Proxy({ canvas: { width: w, height: h } } as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k]
      if (k === 'fillText' || k === 'strokeText') return (s: string) => { if (k === 'fillText') texts.push(s) }
      return (..._a: unknown[]) => undefined
    },
    set(t, k: string, v) { props[k] = v; t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, texts }
}

describe('muteButtonRect2P', () => {
  it('is centred at the top of the screen, clear of both halves\' corners', () => {
    const W = 1280
    const r = muteButtonRect2P(W, hudFontSize(W))
    expect(Math.abs(r.x + r.w / 2 - W / 2)).toBeLessThanOrEqual(1)
    expect(r.y).toBeLessThan(50)
    expect(r.w).toBeGreaterThanOrEqual(24)
    expect(r.h).toBe(r.w)
  })
})

describe('renderHUD options', () => {
  const playing = { ...createInitialState(), phase: 'playing' as const }

  it('draws the mute glyph by default and omits it when showMute is false', () => {
    const a = recorder(); renderHUD(a.ctx, playing, 0)
    expect(a.texts.some((t) => t === '🔊' || t === '🔇')).toBe(true)
    const b = recorder(); renderHUD(b.ctx, playing, 0, { showMute: false })
    expect(b.texts.some((t) => t === '🔊' || t === '🔇')).toBe(false)
  })

  it('draws the seat label only when given', () => {
    const a = recorder(); renderHUD(a.ctx, playing, 0)
    expect(a.texts).not.toContain('P1')
    const b = recorder(); renderHUD(b.ctx, playing, 0, { label: 'P1' })
    expect(b.texts).toContain('P1')
  })

  it('each HUD keeps its own combo pulse: a combo rise in one seat does not pulse the other', () => {
    const p0 = createHudPulse(), p1 = createHudPulse()
    const r = recorder()
    renderHUD(r.ctx, { ...playing, combo: 1 }, 1000, { pulse: p0 })
    renderHUD(r.ctx, { ...playing, combo: 1 }, 1000, { pulse: p1 })
    renderHUD(r.ctx, { ...playing, combo: 2 }, 2000, { pulse: p0 }) // seat 0 ranks up
    renderHUD(r.ctx, { ...playing, combo: 1 }, 2000, { pulse: p1 })
    expect(p0.start).toBe(2000)
    expect(p0.lastCombo).toBe(2)
    expect(p1.start).toBe(-Infinity)
    expect(p1.lastCombo).toBe(1)
  })

  it('a non-playing seat resets its own pulse record only', () => {
    const p0 = createHudPulse(); p0.lastCombo = 3
    const p1 = createHudPulse(); p1.lastCombo = 3
    renderHUD(recorder().ctx, { ...playing, phase: 'gameover' as const }, 0, { pulse: p0 })
    expect(p0.lastCombo).toBe(1)
    expect(p1.lastCombo).toBe(3)
  })
})
