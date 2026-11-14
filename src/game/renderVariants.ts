/**
 * Procedural art of the new ghosts (more-content R1.7, R1.8). Colour is never the only signal:
 * every state has its own icon and outline style in every palette. Telegraphs are slow ramps
 * and pulses (no strobe); the fastest pulse is VARIANT_PULSE_HZ, a quarter of it with reduced flashing.
 */

import type { Enemy } from './state'
import { getPalette } from '../ui/palette'
import { getSettings } from '../settings/runtime'
import { TELEGRAPH_MS, TWIN_WINDOW_MS, ABSORB_COOLDOWN_MS, isLinked } from './enemies/variants'

const P = getPalette
/** Fastest telegraph pulse, Hz (≤ 3). */
export const VARIANT_PULSE_HZ = 1.5
export function variantPulseHz(): number { return VARIANT_PULSE_HZ * (getSettings().reducedFlash ? 0.25 : 1) }
/** 0–1 slow pulse at `variantPulseHz()`. */
export function pulse01(now: number): number { return 0.5 + 0.5 * Math.sin((2 * Math.PI * variantPulseHz() * now) / 1000) }

const C_EYE = '#1a0030'
const WISP_LIT_MS = TWIN_WINDOW_MS - TELEGRAPH_MS

/** Soft ghost silhouette (dome, bulging sides, three scallops) scaled by `s`. */
function body(ctx: CanvasRenderingContext2D, s: number): void {
  const w = 38 * s, h = 48 * s
  ctx.beginPath()
  ctx.arc(0, -h * 0.2, w, Math.PI, 0, false)
  ctx.lineTo(w, h * 0.6)
  const bw = (w * 2) / 3
  ctx.quadraticCurveTo(w - bw * 0.5, h * 0.98, w - bw, h * 0.6)
  ctx.quadraticCurveTo(w - bw * 1.5, h * 0.98, w - bw * 2, h * 0.6)
  ctx.quadraticCurveTo(-w + bw * 0.5, h * 0.98, -w, h * 0.6)
  ctx.closePath()
}

function eyes(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.shadowBlur = 0
  ctx.fillStyle = C_EYE
  ctx.beginPath(); ctx.ellipse(-13 * s, -4 * s, 6 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(13 * s, -4 * s, 6 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill()
}

/** State icon above the ghost: outlined so it reads on any background. */
function icon(ctx: CanvasRenderingContext2D, glyph: string, color: string, y = -62): void {
  ctx.save()
  ctx.shadowBlur = 0
  ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(13,0,20,0.9)'
  ctx.strokeText(glyph, 0, y)
  ctx.fillStyle = color
  ctx.fillText(glyph, 0, y)
  ctx.restore()
}

function hexagon(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    const x = Math.cos(a) * r, y = Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

// ─── Twin wisp ────────────────────────────────────────────────────────────────

/** Fraction of the twin window left (1 → 0, monotonic): the lit part first, then the merging telegraph. */
export function wispRingFraction(e: Enemy): number {
  const elapsed = e.vTimerMs + (e.vState === 'merging' ? WISP_LIT_MS : 0)
  return Math.max(0, Math.min(1, 1 - elapsed / TWIN_WINDOW_MS))
}

export function drawWisp(ctx: CanvasRenderingContext2D, e: Enemy, now: number): void {
  const color = P().wisp
  const linked = isLinked(e)
  ctx.shadowColor = color; ctx.shadowBlur = linked ? 22 : 10
  ctx.fillStyle = color
  const base = ctx.globalAlpha
  ctx.globalAlpha = base * (linked ? 1 : 0.85)
  body(ctx, 0.8); ctx.fill()
  ctx.globalAlpha = base
  eyes(ctx, 0.8)
  icon(ctx, '∞', color, -56)

  if (linked) {
    // Ring timer: one ring shrinking over the whole twin window, blinking slowly only while merging (the telegraph).
    const frac = wispRingFraction(e)
    ctx.save()
    ctx.shadowBlur = 0
    ctx.strokeStyle = color; ctx.lineWidth = 5
    ctx.globalAlpha = base * (e.vState === 'merging' ? 0.35 + 0.55 * pulse01(now) : 1)
    ctx.beginPath()
    ctx.arc(0, 0, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, Math.min(1, frac)))
    ctx.stroke()
    ctx.restore()
  }
}

/** Link line between the two wisps of a pair: dashed while idle, solid and bright while lit or merging. */
export function drawWispLinks(ctx: CanvasRenderingContext2D, enemies: readonly Enemy[], now: number): void {
  const seen = new Map<string, Enemy>()
  for (const e of enemies) {
    if (e.type !== 'wisp' || e.pairId === undefined) continue
    const other = seen.get(e.pairId)
    if (!other) { seen.set(e.pairId, e); continue }
    const lit = isLinked(e) || isLinked(other)
    ctx.save()
    ctx.shadowBlur = 0
    ctx.strokeStyle = P().wisp
    ctx.lineWidth = lit ? 4 : 2
    ctx.globalAlpha = lit ? 0.5 + 0.4 * (e.vState === 'merging' || other.vState === 'merging' ? pulse01(now) : 1) : 0.35
    ctx.setLineDash(lit ? [] : [8, 8])
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(other.x, other.y); ctx.stroke()
    ctx.restore()
  }
}

// ─── Mirror ghost ─────────────────────────────────────────────────────────────

export function drawMirror(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const color = P().mirror
  const st = e.vState
  const protectedNow = st === 'shield' || st === 'cracking'
  ctx.shadowColor = color; ctx.shadowBlur = st === 'cracking' ? 14 + 16 * (e.vTimerMs / TELEGRAPH_MS) : 12
  ctx.fillStyle = color
  body(ctx, 1); ctx.fill()
  eyes(ctx, 1)

  ctx.save()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4
  const R = 56
  if (st === 'shield') {
    ctx.fillStyle = 'rgba(184,196,255,0.22)'
    hexagon(ctx, R); ctx.fill(); ctx.stroke()
  } else if (st === 'cracking') {
    const k = Math.min(1, e.vTimerMs / TELEGRAPH_MS)
    ctx.fillStyle = 'rgba(184,196,255,0.22)'
    hexagon(ctx, R); ctx.fill(); ctx.stroke()
    // growing crack lines (the telegraph)
    ctx.lineWidth = 3
    ctx.beginPath()
    const cracks = 1 + Math.floor(k * 2.99)
    for (let i = 0; i < cracks; i++) {
      const a = (Math.PI * 2 * i) / 3 + 0.4
      ctx.moveTo(Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.35)
      ctx.lineTo(Math.cos(a + 0.15) * R * 0.7, Math.sin(a + 0.15) * R * 0.7)
      ctx.lineTo(Math.cos(a - 0.1) * R * 0.98, Math.sin(a - 0.1) * R * 0.98)
    }
    ctx.stroke()
  } else if (st === 'open') {
    // broken outline: three of the six sides
    ctx.setLineDash([14, 22]); ctx.globalAlpha = 0.6
    hexagon(ctx, R); ctx.stroke()
  } else {
    // closing: the outline returns, ramping in
    const k = Math.min(1, e.vTimerMs / TELEGRAPH_MS)
    ctx.setLineDash([14, 22 - 20 * k]); ctx.globalAlpha = 0.5 + 0.4 * k
    hexagon(ctx, R); ctx.stroke()
  }
  ctx.restore()

  if (e.absorbMs > 0) {
    const k = 1 - e.absorbMs / ABSORB_COOLDOWN_MS
    ctx.save()
    ctx.shadowBlur = 0
    // Reduced flashing: a dim ring that stays put and fades, instead of a bright expanding pulse
    const calm = getSettings().reducedFlash
    ctx.globalAlpha = (1 - k) * (calm ? 0.3 : 1)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = calm ? 3 : 5
    ctx.beginPath(); ctx.arc(0, 0, R + 6 + (calm ? 0 : 22 * k), 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
  icon(ctx, protectedNow ? '▮' : '▯', color, -72)
}

// ─── Blink ghost ──────────────────────────────────────────────────────────────

/** Body alpha of a blink ghost: a slow ramp through the telegraph states, never a hard edge. */
export function blinkAlpha(e: Enemy): number {
  const k = Math.min(1, Math.max(0, e.vTimerMs / TELEGRAPH_MS))
  switch (e.vState) {
    case 'solid': return 1
    case 'warnOut': return 1 - 0.7 * k
    case 'ethereal': return 0.3
    default: return 0.3 + 0.7 * k
  }
}

export function drawBlink(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const color = P().blink
  const base = ctx.globalAlpha
  const solidish = e.vState === 'solid' || e.vState === 'warnOut'
  const dashed = e.vState !== 'solid'
  ctx.globalAlpha = base * blinkAlpha(e)
  ctx.shadowColor = color; ctx.shadowBlur = solidish ? 14 : 4
  ctx.fillStyle = color
  body(ctx, 1); ctx.fill()
  ctx.save()
  ctx.shadowBlur = 0
  ctx.globalAlpha = base * Math.max(0.6, blinkAlpha(e))
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3
  if (dashed) ctx.setLineDash([8, 6])
  body(ctx, 1.06); ctx.stroke()
  ctx.restore()
  ctx.globalAlpha = base * (solidish ? 1 : 0.6)
  eyes(ctx, 1)
  ctx.globalAlpha = base
  icon(ctx, solidish ? '◆' : '◇', color, -62)
}
