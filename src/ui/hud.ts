/**
 * HUD rendering — hearts, timer, score drawn onto the game canvas.
 */

import type { GameState } from '../game/state'

const HEART_FULL = '♥'
const HEART_EMPTY = '♡'

const COLOR_LIVES = '#c0392b'
const COLOR_TIMER = '#ffd166'
const COLOR_TIMER_LOW = '#c0392b'
const COLOR_SCORE = '#ffd166'

export function renderHUD(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const { width: W, height: H } = ctx.canvas
  const pad = 20

  ctx.save()
  ctx.textBaseline = 'top'

  // ── Lives (top-left) ───────────────────────────────────────────────────────
  ctx.font = 'bold 28px sans-serif'
  ctx.shadowColor = COLOR_LIVES
  ctx.shadowBlur = 10
  ctx.fillStyle = COLOR_LIVES

  let heartsStr = ''
  for (let i = 0; i < 3; i++) {
    heartsStr += i < state.lives ? HEART_FULL : HEART_EMPTY
  }
  ctx.fillText(heartsStr, pad, pad)

  // ── Timer (top-right) ──────────────────────────────────────────────────────
  const secsRemaining = Math.ceil(state.roundTimeMs / 1000)
  const mins = Math.floor(secsRemaining / 60)
  const secs = secsRemaining % 60
  const timerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  const isLow = state.roundTimeMs <= 10_000
  // Flash at 1 Hz when low: visible for 500ms on, 500ms off
  const flashVisible = !isLow || Math.floor(now / 500) % 2 === 0

  if (flashVisible) {
    ctx.font = 'bold 28px monospace'
    ctx.shadowColor = isLow ? COLOR_TIMER_LOW : COLOR_TIMER
    ctx.shadowBlur = 12
    ctx.fillStyle = isLow ? COLOR_TIMER_LOW : COLOR_TIMER
    const timerW = ctx.measureText(timerText).width
    ctx.fillText(timerText, W - pad - timerW, pad)
  }

  // ── Score (bottom-left) ────────────────────────────────────────────────────
  ctx.textBaseline = 'bottom'
  ctx.font = 'bold 24px sans-serif'
  ctx.shadowColor = COLOR_SCORE
  ctx.shadowBlur = 10
  ctx.fillStyle = COLOR_SCORE
  ctx.fillText(`Score: ${state.score}`, pad, H - pad)

  ctx.restore()
}
