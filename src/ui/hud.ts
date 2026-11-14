/**
 * HUD — hearts, timer, score, stage label, combo multiplier, mute button.
 * Spooky-skin R5.1: large responsive display text with outline + glow so a
 * kid playing from ~1 m away can read it over the webcam feed.
 */

import type { GameState } from '../game/state'
import { stageLabel } from '../game/stages'
import { isMuted } from '../audio/index'
import { hudFontSize, muteButtonRect, muteButtonRect2P } from './muteRect'
import { getPalette } from './palette'
import { getSettings } from '../settings/runtime'
import { hudLayout, pulseLimit } from './textScale'
export { hudFontSize, muteButtonRect, muteButtonRect2P }

// ─── Palette (see .kiro/steering/design.md; the colourblind variant is in ui/palette.ts) ─────
const C_OUTLINE = 'rgba(13, 0, 20, 0.85)'  // Midnight

/** Chunky rounded display stack — all system fonts, no external assets. */
export const HUD_FONT_FAMILY =
  "'Arial Rounded MT Bold', 'Nunito', 'Varela Round', 'Segoe UI', system-ui, sans-serif"

/** Combo-increment pulse: scale 1.5 → 1.0 over this many ms. */
export const COMBO_PULSE_MS = 200

// ─── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** Scale factor for the combo pulse, given ms since the last increment. */
export function comboPulseScale(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= COMBO_PULSE_MS) return 1
  return 1 + 0.5 * (1 - elapsedMs / COMBO_PULSE_MS)
}

// ─── Combo-pulse animation state (one per HUD: each two-player seat has its own) ──
export interface HudPulse { lastCombo: number; start: number }
export function createHudPulse(): HudPulse {
  return { lastCombo: 1, start: -Infinity }
}
const defaultPulse = createHudPulse()

export interface HudOpts {
  /** Combo-pulse record for this HUD (default: the single-player one). */
  pulse?: HudPulse
  /** Draw the mute button (default true; two-player seats leave it to the shared one). */
  showMute?: boolean
  /** Small tag in the top-left under the hearts, e.g. "P1". */
  label?: string
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

interface TextOpts {
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  glow?: number
  font?: string
}

/** Outline + glow + fill: readable over any webcam background. */
function drawHudText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  opts: TextOpts = {},
): void {
  ctx.save()
  if (opts.font) ctx.font = opts.font
  ctx.textAlign = opts.align ?? 'left'
  ctx.textBaseline = opts.baseline ?? 'top'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 5
  ctx.strokeStyle = C_OUTLINE
  ctx.shadowBlur = 0
  ctx.strokeText(text, x, y)
  ctx.shadowColor = color
  ctx.shadowBlur = opts.glow ?? 12
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

export function renderHUD(ctx: CanvasRenderingContext2D, state: GameState, now: number, opts: HudOpts = {}): void {
  const pulseState = opts.pulse ?? defaultPulse
  if (state.phase !== 'playing') {
    pulseState.lastCombo = 1
    return
  }

  const pal = getPalette()
  const { width: W, height: H } = ctx.canvas
  const pad = 20
  const fontSize = hudFontSize(W)
  const font = (px: number, weight = 'bold') => `${weight} ${px}px ${HUD_FONT_FAMILY}`

  // Track combo increments for the pulse
  if (state.combo > pulseState.lastCombo) pulseState.start = now
  pulseState.lastCombo = state.combo
  const textScale = getSettings().textScale
  const rawPulse = comboPulseScale(now - pulseState.start)
  // With bigger text the pulse is reduced where the score and the combo would collide (R9.2)
  const pulse = 1 + (rawPulse - 1) * ((pulseLimit(W, fontSize, `Score: ${state.score}`.length, textScale) - 1) / 0.5)

  ctx.save()

  // ── Lives (top-left) ───────────────────────────────────────────────────────
  let hearts = ''
  for (let i = 0; i < 3; i++) hearts += i < state.lives ? '♥' : '♡'
  drawHudText(ctx, hearts, pad, pad, pal.life, { font: font(fontSize) })

  // ── Timer (top-right) ──────────────────────────────────────────────────────
  const secsRemaining = Math.ceil(state.roundTimeMs / 1000)
  const mins = Math.floor(secsRemaining / 60)
  const secs = secsRemaining % 60
  const timerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  const isLow = state.roundTimeMs <= 10_000
  const flashVisible = !isLow || Math.floor(now / 500) % 2 === 0
  if (flashVisible) {
    drawHudText(ctx, timerText, W - pad, pad, isLow ? pal.life : pal.score, {
      font: `bold ${fontSize}px monospace`, align: 'right', glow: isLow ? 18 : 12,
    })
  }

  // ── Stage label (top-center) ───────────────────────────────────────────────
  const cfg = stageLabel(state)
  const stageText = `${cfg.name} — ${cfg.subtitle}`
  const lay = hudLayout(W, H, textScale, { label: stageText })
  if (lay.labelPx !== null) { // dropped only with bigger text on a canvas too narrow for it (R9.2)
    drawHudText(ctx, stageText, W / 2, pad, pal.ghost, {
      font: font(lay.labelPx, '600'), align: 'center', glow: 8,
    })
  }

  // ── Score (bottom-left) — pulses with the combo ────────────────────────────
  ctx.save()
  ctx.translate(pad, H - pad)
  ctx.scale(pulse, pulse)
  drawHudText(ctx, `Score: ${state.score}`, 0, 0, pal.score, {
    font: font(fontSize), baseline: 'bottom',
  })
  ctx.restore()

  // ── Combo (bottom-right) — pulses on increment ─────────────────────────────
  if (state.combo > 1) {
    ctx.save()
    ctx.translate(W - pad, H - pad)
    ctx.scale(pulse, pulse)
    drawHudText(ctx, `×${state.combo}`, 0, 0, pal.combo, {
      font: font(Math.round(fontSize * 1.2)), align: 'right', baseline: 'bottom', glow: 16,
    })
    ctx.restore()
  }

  if (opts.label) {
    // Colourblind palette: a different shape and colour per player, never colour alone (R8.2)
    const cb = getSettings().cb
    const mark = cb ? (opts.label === 'P2' ? '■ ' : '● ') : ''
    const labelColor = cb ? (opts.label === 'P2' ? pal.p2 : pal.p1) : pal.ghost
    drawHudText(ctx, mark + opts.label, pad, pad + fontSize + 4, labelColor, {
      font: font(Math.round(fontSize * 0.6), '600'), glow: 8,
    })
  }

  // ── Mute button (top-right, under the timer) ───────────────────────────────
  if (opts.showMute !== false) drawMuteButton(ctx, muteButtonRect(W, fontSize))

  ctx.restore()
}

/** The mute / unmute speaker button, drawn into `mb` (single-player: top-right; two-player: top centre). */
export function drawMuteButton(ctx: CanvasRenderingContext2D, mb: { x: number; y: number; w: number; h: number }): void {
  const pal = getPalette()
  const muted = isMuted()
  ctx.save()
  ctx.fillStyle = muted ? 'rgba(192,57,43,0.35)' : 'rgba(232,232,240,0.18)'
  ctx.strokeStyle = muted ? pal.life : 'rgba(232,232,240,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(mb.x, mb.y, mb.w, mb.h, 8); ctx.fill(); ctx.stroke()
  drawHudText(ctx, muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, muted ? pal.life : pal.ghost, {
    font: `${Math.round(mb.h * 0.6)}px sans-serif`, align: 'center', baseline: 'middle', glow: 6,
  })
  ctx.restore()
}
