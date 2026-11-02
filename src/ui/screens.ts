/**
 * UI screens — canvas-rendered overlays for start, stage title, summary,
 * and game over. Motion buttons handle interaction where possible.
 */

import type { GameState } from '../game/state'
import { STAGES } from '../game/stages'
import { MotionButton } from './motionButton'

// ─── Motion buttons (persistent instances reused across frames) ───────────────

let startBtn: MotionButton | null = null
let retryBtn: MotionButton | null = null
let menuBtn: MotionButton | null = null
let nextBtn: MotionButton | null = null

// ─── Start screen ─────────────────────────────────────────────────────────────

export function renderStartScreen(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  onStart: () => void,
): void {
  const { width: W, height: H } = ctx.canvas

  // Dark overlay
  ctx.save()
  ctx.fillStyle = 'rgba(13, 0, 20, 0.88)'
  ctx.fillRect(0, 0, W, H)

  // Title
  ctx.textAlign = 'center'
  ctx.font = `bold ${clamp(W / 10, 48, 96)}px sans-serif`
  ctx.fillStyle = '#ff6b1a'
  ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 24
  ctx.fillText('👻 EXORCISE', W / 2, H * 0.28)

  // Subtitle
  ctx.font = `${clamp(W / 28, 18, 28)}px sans-serif`
  ctx.fillStyle = '#e8e8f0'; ctx.shadowBlur = 0
  ctx.fillText('Swat the ghosts with your hands!', W / 2, H * 0.42)

  // High score
  if (state.highScore > 0) {
    ctx.font = `bold ${clamp(W / 36, 16, 22)}px sans-serif`
    ctx.fillStyle = '#ffd166'
    ctx.fillText(`Best: ${state.highScore}`, W / 2, H * 0.52)
  }

  // Motion button
  if (!startBtn || startBtn.cx !== W / 2) {
    startBtn = new MotionButton(W / 2, H * 0.72, clamp(W / 8, 56, 90), '▶ START')
  }
  const result = startBtn.update(now)
  startBtn.render(ctx, now)

  // Instruction
  ctx.font = `${clamp(W / 40, 13, 18)}px sans-serif`
  ctx.fillStyle = 'rgba(232,232,240,0.6)'; ctx.shadowBlur = 0
  ctx.fillText('Wave over the button to start  •  Press Space', W / 2, H * 0.88)

  ctx.restore()

  if (result === 'triggered') onStart()
}

// ─── Stage title card ─────────────────────────────────────────────────────────

export function renderStageTitle(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { width: W, height: H } = ctx.canvas
  const cfg = STAGES[state.stage - 1]
  const secs = Math.ceil(state.stageTitleMs / 1000)

  ctx.save()
  ctx.fillStyle = 'rgba(13,0,20,0.82)'
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.font = `bold ${clamp(W / 14, 36, 64)}px sans-serif`
  ctx.fillStyle = '#ff6b1a'
  ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 20
  ctx.fillText(cfg.name, W / 2, H * 0.38)

  ctx.font = `${clamp(W / 20, 24, 40)}px sans-serif`
  ctx.fillStyle = '#ffd166'; ctx.shadowBlur = 0
  ctx.fillText(cfg.subtitle, W / 2, H * 0.52)

  ctx.font = `bold ${clamp(W / 12, 40, 72)}px monospace`
  ctx.fillStyle = '#e8e8f0'
  ctx.fillText(String(secs), W / 2, H * 0.7)

  ctx.restore()
}

// ─── Stage summary ────────────────────────────────────────────────────────────

export function renderSummary(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  onNext: () => void,
): void {
  const { width: W, height: H } = ctx.canvas
  const stars = calcStars(state)

  ctx.save()
  ctx.fillStyle = 'rgba(13,0,20,0.88)'
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.font = `bold ${clamp(W / 14, 32, 56)}px sans-serif`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14
  ctx.fillText('STAGE CLEAR!', W / 2, H * 0.18)

  ctx.shadowBlur = 0
  ctx.font = `${clamp(W / 12, 36, 60)}px sans-serif`
  ctx.fillText('⭐'.repeat(stars) + '☆'.repeat(3 - stars), W / 2, H * 0.3)

  const rows = [
    [`Banished`, `${state.stageBanished}`],
    [`Missed`,   `${state.stageMissed}`],
    [`Best combo`, `x${state.bestCombo}`],
    [`Score`,    `${state.score}`],
  ]
  const rowH = H * 0.09
  let ry = H * 0.42
  ctx.font = `${clamp(W / 30, 16, 24)}px sans-serif`
  for (const [label, val] of rows) {
    ctx.fillStyle = 'rgba(232,232,240,0.7)'; ctx.textAlign = 'left'
    ctx.fillText(label, W * 0.28, ry)
    ctx.fillStyle = '#ffd166'; ctx.textAlign = 'right'
    ctx.fillText(val, W * 0.72, ry)
    ry += rowH
  }

  // Next button
  if (!nextBtn || nextBtn.cx !== W / 2) {
    nextBtn = new MotionButton(W / 2, H * 0.84, clamp(W / 8, 50, 80), '▶ NEXT')
  }
  const res = nextBtn.update(now)
  nextBtn.render(ctx, now)
  ctx.restore()

  if (res === 'triggered') onNext()
}

// ─── Game Over ────────────────────────────────────────────────────────────────

export function renderGameOver(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  onRetry: () => void,
  onMenu: () => void,
): void {
  const { width: W, height: H } = ctx.canvas

  ctx.save()
  ctx.fillStyle = 'rgba(13,0,20,0.88)'
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.font = `bold ${clamp(W / 10, 48, 80)}px sans-serif`
  ctx.fillStyle = '#c0392b'; ctx.shadowColor = '#c0392b'; ctx.shadowBlur = 24
  ctx.fillText('GAME OVER', W / 2, H * 0.28)

  ctx.shadowBlur = 0
  ctx.font = `bold ${clamp(W / 22, 22, 36)}px sans-serif`
  ctx.fillStyle = '#ffd166'
  ctx.fillText(`Score: ${state.score}`, W / 2, H * 0.42)
  if (state.highScore > state.score) {
    ctx.font = `${clamp(W / 34, 14, 20)}px sans-serif`
    ctx.fillStyle = 'rgba(232,232,240,0.6)'
    ctx.fillText(`Best: ${state.highScore}`, W / 2, H * 0.51)
  }

  // Retry button
  if (!retryBtn) retryBtn = new MotionButton(W * 0.35, H * 0.72, clamp(W / 9, 48, 76), '↩ RETRY')
  else { retryBtn.cx = W * 0.35; retryBtn.cy = H * 0.72 }
  const r1 = retryBtn.update(now)
  retryBtn.render(ctx, now)

  // Menu button
  if (!menuBtn) menuBtn = new MotionButton(W * 0.65, H * 0.72, clamp(W / 9, 48, 76), '⌂ MENU')
  else { menuBtn.cx = W * 0.65; menuBtn.cy = H * 0.72 }
  const r2 = menuBtn.update(now)
  menuBtn.render(ctx, now)

  ctx.restore()

  if (r1 === 'triggered') onRetry()
  if (r2 === 'triggered') onMenu()
}

// ─── Webcam error (HTML) ──────────────────────────────────────────────────────

const ui = (): HTMLElement => document.getElementById('ui')!
let errorEl: HTMLElement | null = null

export function showWebcamError(onRetry: () => void): void {
  if (errorEl) return
  const div = document.createElement('div')
  div.className = 'screen-error'
  div.innerHTML = `
    <p>👻 Exorcise needs your webcam to work.<br>
    Please allow camera access and try again.</p>
    <button type="button">Try again</button>
  `
  div.querySelector('button')!.addEventListener('click', () => { hideWebcamError(); onRetry() })
  errorEl = div
  ui().appendChild(div)
}

export function hideWebcamError(): void {
  if (errorEl) { errorEl.remove(); errorEl = null }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)))
}

function calcStars(state: GameState): number {
  if (state.stageMissed === 0 && state.lives === 3) return 3
  if (state.stageMissed <= 1 || state.lives >= 2) return 2
  return 1
}
