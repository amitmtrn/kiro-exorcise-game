/**
 * HUD — hearts, timer, score, stage label, combo multiplier.
 */

import type { GameState } from '../game/state'
import { STAGES } from '../game/stages'
import { isMuted } from '../audio/index'

export function renderHUD(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  if (state.phase !== 'playing') return

  const { width: W, height: H } = ctx.canvas
  const pad = 20
  const fontSize = Math.max(22, Math.min(38, Math.round(W / 22)))

  ctx.save()
  ctx.shadowBlur = 10

  // ── Lives (top-left) ───────────────────────────────────────────────────────
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textBaseline = 'top'
  ctx.shadowColor = '#c0392b'
  ctx.fillStyle = '#c0392b'
  let hearts = ''
  for (let i = 0; i < 3; i++) hearts += i < state.lives ? '♥' : '♡'
  ctx.fillText(hearts, pad, pad)

  // ── Timer (top-right) ──────────────────────────────────────────────────────
  const secsRemaining = Math.ceil(state.roundTimeMs / 1000)
  const mins = Math.floor(secsRemaining / 60)
  const secs = secsRemaining % 60
  const timerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  const isLow = state.roundTimeMs <= 10_000
  const flashVisible = !isLow || Math.floor(now / 500) % 2 === 0
  if (flashVisible) {
    ctx.font = `bold ${fontSize}px monospace`
    ctx.shadowColor = isLow ? '#c0392b' : '#ffd166'
    ctx.fillStyle = isLow ? '#c0392b' : '#ffd166'
    const tw = ctx.measureText(timerText).width
    ctx.fillText(timerText, W - pad - tw, pad)
  }

  // ── Stage label (top-center) ───────────────────────────────────────────────
  const cfg = STAGES[state.stage - 1]
  ctx.font = `${Math.round(fontSize * 0.65)}px sans-serif`
  ctx.shadowColor = 'rgba(232,232,240,0.5)'; ctx.shadowBlur = 6
  ctx.fillStyle = 'rgba(232,232,240,0.55)'
  ctx.textAlign = 'center'
  ctx.fillText(`${cfg.name} — ${cfg.subtitle}`, W / 2, pad)
  ctx.textAlign = 'left'

  // ── Score (bottom-left) ────────────────────────────────────────────────────
  ctx.textBaseline = 'bottom'
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 10
  ctx.fillStyle = '#ffd166'
  ctx.fillText(`Score: ${state.score}`, pad, H - pad)

  // ── Combo (bottom-right) ───────────────────────────────────────────────────
  if (state.combo > 1) {
    ctx.font = `bold ${Math.round(fontSize * 1.1)}px sans-serif`
    ctx.shadowColor = '#39ff14'; ctx.shadowBlur = 14
    ctx.fillStyle = '#39ff14'
    const comboText = `x${state.combo}`
    const cw = ctx.measureText(comboText).width
    ctx.fillText(comboText, W - pad - cw, H - pad)
  }

  // ── Mute indicator (top-right, next to timer) ──────────────────────────────
  ctx.textBaseline = 'top'
  ctx.font = `${Math.round(fontSize * 0.8)}px sans-serif`
  ctx.shadowBlur = 0
  ctx.fillStyle = isMuted() ? '#c0392b' : 'rgba(232,232,240,0.5)'
  ctx.textAlign = 'right'
  ctx.fillText(isMuted() ? '🔇' : '🔊', W - pad, pad + fontSize + 4)
  ctx.textAlign = 'left'

  ctx.restore()
}
