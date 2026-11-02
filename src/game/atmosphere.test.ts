import { describe, it, expect } from 'vitest'
import {
  drawWebcamTint,
  drawFog,
  drawCandleGlow,
  fogBanks,
  candleGlowAlpha,
  candlePositions,
  WEBCAM_TINT,
  CANDLE_RADIUS,
} from './atmosphere'

// ─── Minimal recording canvas context ────────────────────────────────────────

interface Call { name: string; args: unknown[]; fillStyle: unknown }

function mockCtx(width = 800, height = 600) {
  const calls: Call[] = []
  const gradient = { addColorStop: () => {}, __gradient: true }
  const ctx: Record<string, unknown> & { fillStyle: unknown } = {
    canvas: { width, height },
    fillStyle: '',
    shadowBlur: 0,
  }
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args, fillStyle: ctx.fillStyle })
    return name.startsWith('create') ? gradient : undefined
  }
  for (const m of [
    'save', 'restore', 'translate', 'scale', 'fillRect', 'beginPath', 'arc',
    'ellipse', 'fill', 'createLinearGradient', 'createRadialGradient',
  ]) ctx[m] = record(m)
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, gradient }
}

const W = 800, H = 600

// ─── R1.1 — Webcam tint ───────────────────────────────────────────────────────

describe('drawWebcamTint', () => {
  it('fills the entire canvas with the purple tint', () => {
    const { ctx, calls } = mockCtx(W, H)
    drawWebcamTint(ctx)
    const rects = calls.filter((c) => c.name === 'fillRect')
    expect(rects).toHaveLength(1)
    expect(rects[0].args).toEqual([0, 0, W, H])
    expect(rects[0].fillStyle).toBe(WEBCAM_TINT)
  })

  it('restores context state afterwards', () => {
    const { ctx, calls } = mockCtx()
    drawWebcamTint(ctx)
    expect(calls.filter((c) => c.name === 'save')).toHaveLength(1)
    expect(calls.filter((c) => c.name === 'restore')).toHaveLength(1)
  })
})

// ─── R2.1 — Fog ───────────────────────────────────────────────────────────────

describe('fogBanks', () => {
  it('produces 3–4 banks', () => {
    const n = fogBanks(W, H, 0).length
    expect(n).toBeGreaterThanOrEqual(3)
    expect(n).toBeLessThanOrEqual(4)
  })

  it('keeps every bank inside the lower third of the screen', () => {
    for (const t of [0, 1234, 9999, 60000]) {
      for (const b of fogBanks(W, H, t)) {
        expect(b.y - b.ry).toBeGreaterThanOrEqual(H * (2 / 3))
      }
    }
  })

  it('drifts horizontally over time but stays near its base position', () => {
    const a = fogBanks(W, H, 0)
    const b = fogBanks(W, H, 3000)
    expect(a[0].x).not.toBe(b[0].x)
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(a[i].x - b[i].x)).toBeLessThanOrEqual(W * 0.12 + 1e-9)
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(fogBanks(W, H, 777)).toEqual(fogBanks(W, H, 777))
  })
})

describe('drawFog', () => {
  it('lays a base gradient rect over exactly the lower third', () => {
    const { ctx, calls, gradient } = mockCtx(W, H)
    drawFog(ctx, 0)
    const base = calls.find((c) => c.name === 'fillRect')!
    expect(base.fillStyle).toBe(gradient)
    const [x, y, w, h] = base.args as number[]
    expect(x).toBe(0)
    expect(y).toBeCloseTo(H * (2 / 3))
    expect(w).toBe(W)
    expect(h).toBeCloseTo(H / 3)
  })

  it('draws one radial-gradient ellipse per fog bank', () => {
    const { ctx, calls } = mockCtx(W, H)
    drawFog(ctx, 0)
    const radial = calls.filter((c) => c.name === 'createRadialGradient')
    expect(radial).toHaveLength(fogBanks(W, H, 0).length)
  })
})

// ─── R2.2 — Candle glow ───────────────────────────────────────────────────────

describe('candleGlowAlpha', () => {
  it('stays within (0, 1) and pulses over time', () => {
    const samples = [0, 400, 800, 1256, 2512, 5000].map(candleGlowAlpha)
    for (const a of samples) {
      expect(a).toBeGreaterThan(0)
      expect(a).toBeLessThan(1)
    }
    expect(new Set(samples.map((a) => a.toFixed(4))).size).toBeGreaterThan(1)
  })
})

describe('candlePositions', () => {
  it('places one candle near the bottom-left and one near the bottom-right', () => {
    const [left, right] = candlePositions(W, H)
    expect(left.x).toBeLessThan(W * 0.1)
    expect(right.x).toBeGreaterThan(W * 0.9)
    expect(left.y).toBeGreaterThan(H * 0.9)
    expect(right.y).toBeGreaterThan(H * 0.9)
  })
})

describe('drawCandleGlow', () => {
  it('creates two radial gradients of CANDLE_RADIUS at the candle positions', () => {
    const { ctx, calls } = mockCtx(W, H)
    drawCandleGlow(ctx, 0)
    const radial = calls.filter((c) => c.name === 'createRadialGradient')
    expect(radial).toHaveLength(2)
    const positions = candlePositions(W, H)
    radial.forEach((c, i) => {
      const [x0, y0, r0, x1, y1, r1] = c.args as number[]
      expect(x0).toBe(positions[i].x)
      expect(y0).toBe(positions[i].y)
      expect(x1).toBe(positions[i].x)
      expect(y1).toBe(positions[i].y)
      expect(r0).toBe(0)
      expect(r1).toBe(CANDLE_RADIUS)
    })
  })
})
