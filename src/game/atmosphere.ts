/**
 * Atmosphere — webcam tint, drifting fog, and candle glow.
 * Spec: .kiro/specs/spooky-skin (R1.1 tint, R2.1 fog, R2.2 candle glow)
 *
 * Everything here is procedural canvas 2D. The geometry helpers
 * (`fogBanks`, `candleGlowAlpha`, `candlePositions`) are pure so they can be
 * unit-tested without a real canvas.
 */

// ─── Palette (see .kiro/steering/design.md) ──────────────────────────────────
export const WEBCAM_TINT   = 'rgba(40, 0, 60, 0.22)'   // haunted purple-blue
const FOG_RGB              = '42, 8, 69'               // Deep Purple #2a0845
const CANDLE_RGB           = '255, 107, 26'            // Pumpkin Orange #ff6b1a
const FLAME_COLOR          = '#ffd166'                 // Candlelight Yellow

export const CANDLE_RADIUS = 120
export const CANDLE_INSET  = 40

// ─── R1.1 — Webcam tint ───────────────────────────────────────────────────────

/** Draws a translucent purple rect over the whole webcam canvas. */
export function drawWebcamTint(ctx: CanvasRenderingContext2D): void {
  const { width, height } = ctx.canvas
  ctx.save()
  ctx.fillStyle = WEBCAM_TINT
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

// ─── R2.1 — Fog ───────────────────────────────────────────────────────────────

interface FogBankDef {
  xFrac: number   // base center x as a fraction of canvas width
  yFrac: number   // center y as a fraction of canvas height
  rxFrac: number  // horizontal radius as a fraction of width
  ryFrac: number  // vertical radius as a fraction of height
  phase: number   // sine phase offset so each bank drifts independently
  alpha: number   // peak opacity at the ellipse center
}

export interface FogBank {
  x: number
  y: number
  rx: number
  ry: number
  alpha: number
}

/** Four banks, all kept inside the lower third of the screen. */
const FOG_BANK_DEFS: FogBankDef[] = [
  { xFrac: 0.15, yFrac: 0.95, rxFrac: 0.35, ryFrac: 0.14, phase: 0.0, alpha: 0.35 },
  { xFrac: 0.50, yFrac: 1.00, rxFrac: 0.40, ryFrac: 0.16, phase: 1.7, alpha: 0.30 },
  { xFrac: 0.85, yFrac: 0.93, rxFrac: 0.32, ryFrac: 0.13, phase: 3.1, alpha: 0.35 },
  { xFrac: 0.35, yFrac: 0.88, rxFrac: 0.25, ryFrac: 0.10, phase: 4.6, alpha: 0.22 },
]

/** Horizontal drift amplitude as a fraction of canvas width. */
const FOG_DRIFT_FRAC = 0.06
/** Drift period divisor — `Math.sin(now / 4000)` per the spec design. */
const FOG_DRIFT_MS = 4000

/** Pure: resolves fog bank geometry for a given canvas size and time. */
export function fogBanks(width: number, height: number, now: number): FogBank[] {
  return FOG_BANK_DEFS.map((b) => ({
    x: b.xFrac * width + Math.sin(now / FOG_DRIFT_MS + b.phase) * width * FOG_DRIFT_FRAC,
    y: b.yFrac * height,
    rx: b.rxFrac * width,
    ry: b.ryFrac * height,
    alpha: b.alpha,
  }))
}

/** Draws the base gradient over the lower third plus the drifting banks. */
export function drawFog(ctx: CanvasRenderingContext2D, now: number): void {
  const { width: W, height: H } = ctx.canvas
  const fogTop = H * (2 / 3)

  ctx.save()
  ctx.shadowBlur = 0

  // Base layer — transparent at the top of the lower third, solid-ish at the floor.
  const base = ctx.createLinearGradient(0, fogTop, 0, H)
  base.addColorStop(0, `rgba(${FOG_RGB}, 0)`)
  base.addColorStop(1, `rgba(${FOG_RGB}, 0.55)`)
  ctx.fillStyle = base
  ctx.fillRect(0, fogTop, W, H - fogTop)

  // Drifting banks — elliptical radial gradients via a scaled unit circle.
  for (const b of fogBanks(W, H, now)) {
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.scale(b.rx, b.ry)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, `rgba(${FOG_RGB}, ${b.alpha})`)
    g.addColorStop(1, `rgba(${FOG_RGB}, 0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

// ─── R2.2 — Candle glow ───────────────────────────────────────────────────────

/** Pure: slow pulse on the glow alpha, `Math.sin(now / 800)` per the design. */
export function candleGlowAlpha(now: number): number {
  return 0.38 + 0.12 * Math.sin(now / 800)
}

/** Pure: the two candle centers, inset from the bottom-left and bottom-right corners. */
export function candlePositions(width: number, height: number): Array<{ x: number; y: number }> {
  return [
    { x: CANDLE_INSET, y: height - CANDLE_INSET },
    { x: width - CANDLE_INSET, y: height - CANDLE_INSET },
  ]
}

/** Draws a pulsing orange radial glow and a small flame at each candle position. */
export function drawCandleGlow(ctx: CanvasRenderingContext2D, now: number): void {
  const { width: W, height: H } = ctx.canvas
  const alpha = candleGlowAlpha(now)

  ctx.save()
  ctx.shadowBlur = 0
  for (const c of candlePositions(W, H)) {
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, CANDLE_RADIUS)
    g.addColorStop(0, `rgba(${CANDLE_RGB}, ${alpha})`)
    g.addColorStop(0.5, `rgba(${CANDLE_RGB}, ${alpha * 0.35})`)
    g.addColorStop(1, `rgba(${CANDLE_RGB}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(c.x - CANDLE_RADIUS, c.y - CANDLE_RADIUS, CANDLE_RADIUS * 2, CANDLE_RADIUS * 2)

    // Tiny flickering flame — a teardrop that jitters with a faster sine.
    const flicker = 1 + 0.15 * Math.sin(now / 90 + c.x)
    ctx.fillStyle = FLAME_COLOR
    ctx.beginPath()
    ctx.ellipse(c.x, c.y - 6 * flicker, 4, 8 * flicker, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
