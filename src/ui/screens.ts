/**
 * UI screens — canvas-rendered overlays for start, stage title, summary,
 * and game over. Motion buttons handle interaction where possible.
 */

import type { GameState } from '../game/state'
import { stageLabel } from '../game/stages'
import { STAGE_TITLE_DURATION_MS } from '../game/state'
import { introPose, outroPose, outroRowAlpha } from '../game/transitions'
import { MotionButton } from './motionButton'
import { TITLE_FONT_FAMILY } from './fonts'
import { getPlayerMode } from '../game/playerMode'
import type { PlayerMode } from '../game/playerMode'
import { renderCardOffer, endButtonsLive, registerEndButtonReset } from './cardScreen'

// ─── Motion buttons (persistent instances reused across frames) ───────────────

let startBtn: MotionButton | null = null
let twoBtn: MotionButton | null = null
/** Start-screen input lock-out: coming back from MENU must not auto-start a game while the player is still waving. */
export const START_INPUT_DELAY_MS = 1000
let startShownAt: number | null = null

/** Call when the start screen is (re)entered: restarts the input lock-out and drops stale button fill. */
export function resetStartScreen(): void {
  startShownAt = null; startBtn = null; twoBtn = null
}
let retryBtn: MotionButton | null = null
let menuBtn: MotionButton | null = null
let nextBtn: MotionButton | null = null
let winBtn: MotionButton | null = null
let winMenuBtn: MotionButton | null = null

registerEndButtonReset(() => {
  for (const b of [retryBtn, menuBtn, winBtn, winMenuBtn]) b?.reset()
})
// Victory: ignore the buttons briefly so the wave that beat the boss can't trigger them.
let victoryShownAt: number | null = null
const VICTORY_INPUT_DELAY_MS = 1500
const VICTORY_FADE_MS = 400

// ─── Start screen ─────────────────────────────────────────────────────────────

export function renderStartScreen(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  onStart: (mode: PlayerMode) => void,
): void {
  const { width: W, height: H } = ctx.canvas

  // Dark overlay
  ctx.save()
  ctx.fillStyle = 'rgba(13, 0, 20, 0.88)'
  ctx.fillRect(0, 0, W, H)

  // Title
  ctx.textAlign = 'center'
  ctx.font = `${clamp(W / 8, 56, 120)}px ${TITLE_FONT_FAMILY}`
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

  // Mode buttons: 1 PLAYER stays at the old START position (the motion harness
  // waves over it); 2 PLAYERS sits to its right. The remembered mode is ringed.
  // Shrink the buttons on very narrow canvases so the pair never overlaps (centres ≥ 2r+gap apart).
  const r = Math.min(clamp(W / 8, 56, 90), Math.max(24, (W - 16) / 5.2))
  const by = H * 0.72
  // Entry is signalled by resetStartScreen(); the first render after it starts the lock-out.
  if (startShownAt === null) startShownAt = now
  const live = now - startShownAt >= START_INPUT_DELAY_MS
  const gap = r * 2.6
  const shift = Math.max(0, W / 2 + gap + r + 4 - W) // slide the pair left only as far as needed
  const oneX = W / 2 - shift
  const twoX = oneX + gap
  if (!startBtn || startBtn.cx !== oneX || startBtn.radius !== r) {
    startBtn = new MotionButton(oneX, by, r, '1 PLAYER')
  }
  if (!twoBtn || twoBtn.cx !== twoX || twoBtn.radius !== r) {
    twoBtn = new MotionButton(twoX, by, r, '2 PLAYERS')
  }
  const result = live ? startBtn.update(now) : null
  const result2 = live ? twoBtn.update(now) : null
  startBtn.render(ctx, now)
  twoBtn.render(ctx, now)
  const last = getPlayerMode()
  const ring = last === 1 ? startBtn : twoBtn
  ctx.beginPath()
  ctx.arc(ring.cx, ring.cy, r + 8, 0, Math.PI * 2)
  ctx.strokeStyle = '#ff6b1a'; ctx.lineWidth = 3; ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 10
  ctx.stroke()

  // Instruction
  ctx.font = `${clamp(W / 40, 13, 18)}px sans-serif`
  ctx.fillStyle = 'rgba(232,232,240,0.6)'; ctx.shadowBlur = 0
  ctx.fillText('Wave over a button  •  or press 1 / 2  •  Space = last mode', W / 2, H * 0.9)

  ctx.restore()

  if (result === 'triggered') onStart(1)
  else if (result2 === 'triggered') onStart(2)
}

// ─── Stage title card ─────────────────────────────────────────────────────────

export function renderStageTitle(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { width: W, height: H } = ctx.canvas
  const cfg = stageLabel(state)
  const secs = Math.ceil(state.stageTitleMs / 1000)

  // Juice R5.1: the name slides in from the left, the subtitle from the right, the card fades out
  const pose = introPose(STAGE_TITLE_DURATION_MS - state.stageTitleMs, STAGE_TITLE_DURATION_MS)

  ctx.save()
  ctx.globalAlpha = pose.alpha
  ctx.fillStyle = 'rgba(13,0,20,0.82)'
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.font = `${clamp(W / 11, 42, 80)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ff6b1a'
  ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 20
  ctx.fillText(cfg.name, W / 2 + pose.nameX * W, H * 0.38)

  ctx.font = `${clamp(W / 20, 24, 40)}px sans-serif`
  ctx.fillStyle = '#ffd166'; ctx.shadowBlur = 0
  ctx.fillText(cfg.subtitle, W / 2 + pose.subX * W, H * 0.52)

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
  const outro = outroPose(state.summaryShownMs) // juice R5.2

  ctx.save()
  ctx.fillStyle = `rgba(13,0,20,${outro.overlayAlpha})`
  ctx.fillRect(0, 0, W, H)

  // Banner drops in with a settling wobble
  ctx.save()
  ctx.translate(W / 2, H * outro.bannerY)
  ctx.rotate(outro.bannerAngle)
  ctx.scale(outro.bannerScale, outro.bannerScale)
  ctx.textAlign = 'center'
  ctx.font = `${clamp(W / 11, 38, 68)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14
  ctx.fillText(state.bonus ? 'BONUS CLEAR!' : 'STAGE CLEAR!', 0, 0)
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd166'
  ctx.shadowBlur = 0
  ctx.font = `${clamp(W / 12, 36, 60)}px sans-serif`
  ctx.globalAlpha = outroRowAlpha(state.summaryShownMs, 0)
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
  rows.forEach(([label, val], i) => {
    ctx.globalAlpha = outroRowAlpha(state.summaryShownMs, i + 1)
    ctx.fillStyle = 'rgba(232,232,240,0.7)'; ctx.textAlign = 'left'
    ctx.fillText(label, W * 0.28, ry)
    ctx.fillStyle = '#ffd166'; ctx.textAlign = 'right'
    ctx.fillText(val, W * 0.72, ry)
    ry += rowH
  })
  ctx.globalAlpha = 1 // the NEXT button is never faded or delayed (R5.3)

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
  onCard?: () => void,
): void {
  const { width: W, height: H } = ctx.canvas

  ctx.save()
  ctx.fillStyle = 'rgba(13,0,20,0.88)'
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.font = `${clamp(W / 8, 56, 100)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#c0392b'; ctx.shadowColor = '#c0392b'; ctx.shadowBlur = 24
  ctx.fillText('GAME OVER', W / 2, H * 0.28)
  if (state.lives > 0) {
    // Lives remain, so the stage timer ran out with the boss alive (boss-phases R6.5).
    ctx.shadowBlur = 0
    ctx.font = `bold ${clamp(W / 28, 18, 30)}px sans-serif`
    ctx.fillStyle = '#ff6b1a'
    ctx.fillText("TIME'S UP", W / 2, H * 0.35)
    ctx.font = `${clamp(W / 8, 56, 100)}px ${TITLE_FONT_FAMILY}`
    ctx.fillStyle = '#c0392b'
  }

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
  const live = endButtonsLive(now)
  const r1 = retryBtn.updateGated(now, live)
  retryBtn.render(ctx, now)

  // Menu button
  if (!menuBtn) menuBtn = new MotionButton(W * 0.65, H * 0.72, clamp(W / 9, 48, 76), '⌂ MENU')
  else { menuBtn.cx = W * 0.65; menuBtn.cy = H * 0.72 }
  const r2 = menuBtn.updateGated(now, live)
  menuBtn.render(ctx, now)

  // Exorcist Card offer (exorcist-card R1.1): only an explicit choice makes a card.
  const cardChosen = renderCardOffer(ctx, now, H * 0.72, clamp(W / 9, 48, 76))

  ctx.restore()

  if (cardChosen) { onCard?.(); return }
  if (r1 === 'triggered') onRetry()
  if (r2 === 'triggered') onMenu()
}

// ─── Victory (boss-phases R6.3) ──────────────────────────────────────────────

/** Call once when the game enters `victory`: restarts the banner and input lockout. */
export function resetVictoryScreen(): void {
  victoryShownAt = null
}

export function renderVictory(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  onPlayAgain: () => void,
  onMenu: () => void,
  onCard?: () => void,
): void {
  const { width: W, height: H } = ctx.canvas
  if (victoryShownAt === null) victoryShownAt = now
  const t = now - victoryShownAt

  ctx.save()
  // Fade the backdrop in so the boss-defeat burst stays visible for a moment.
  ctx.fillStyle = `rgba(13,0,20,${0.88 * Math.min(1, t / VICTORY_FADE_MS)})`
  ctx.fillRect(0, 0, W, H)

  // Wobble-in banner
  const k = Math.min(1, t / 700)
  const wobble = Math.sin(t / 90) * (1 - k) * 0.25
  ctx.save()
  ctx.translate(W / 2, H * 0.24)
  ctx.rotate(wobble)
  ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k)
  ctx.textAlign = 'center'
  ctx.font = `${clamp(W / 7, 56, 120)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 28
  ctx.fillText('YOU WIN!', 0, 0)
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.shadowBlur = 0
  ctx.font = `${clamp(W / 26, 18, 30)}px sans-serif`
  ctx.fillStyle = '#e8e8f0'
  ctx.fillText('The ghosts have been exorcised 🎃', W / 2, H * 0.36)
  ctx.font = `bold ${clamp(W / 18, 26, 44)}px sans-serif`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 12
  ctx.fillText(`Total score: ${state.score}`, W / 2, H * 0.48)
  ctx.shadowBlur = 0
  if (state.highScore > state.score) {
    ctx.font = `${clamp(W / 34, 14, 20)}px sans-serif`
    ctx.fillStyle = 'rgba(232,232,240,0.6)'
    ctx.fillText(`Best: ${state.highScore}`, W / 2, H * 0.56)
  }

  const r = clamp(W / 9, 48, 76)
  if (!winBtn) winBtn = new MotionButton(W * 0.35, H * 0.74, r, 'PLAY AGAIN')
  else { winBtn.cx = W * 0.35; winBtn.cy = H * 0.74 }
  if (!winMenuBtn) winMenuBtn = new MotionButton(W * 0.65, H * 0.74, r, 'MAIN MENU')
  else { winMenuBtn.cx = W * 0.65; winMenuBtn.cy = H * 0.74 }
  // Buttons ignore motion (no filling) until the input lockout ends.
  const live = t >= VICTORY_INPUT_DELAY_MS
  const live2 = live && endButtonsLive(now)
  const r1 = winBtn.updateGated(now, live2)
  winBtn.render(ctx, now)
  const r2 = winMenuBtn.updateGated(now, live2)
  winMenuBtn.render(ctx, now)
  const cardChosen = renderCardOffer(ctx, now, H * 0.74, r, live)
  ctx.restore()

  if (!live) return
  if (cardChosen) { onCard?.(); return }
  if (r1 === 'triggered') onPlayAgain()
  else if (r2 === 'triggered') onMenu()
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
