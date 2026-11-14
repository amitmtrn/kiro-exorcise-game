/**
 * UI screens — canvas-rendered overlays for start, stage title, summary,
 * and game over. Motion buttons handle interaction where possible.
 */

import type { GameState } from '../game/state'
import { stageLabel, STAGES } from '../game/stages'
import { STAGE_TITLE_DURATION_MS } from '../game/state'
import { introPose, outroPose, outroRowAlpha } from '../game/transitions'
import { EntryLock, ENTRY_LOCK_MS, updateExclusive } from './motionButton'
import { ButtonSet } from './buttonSet'
import { buttonLayout, fitFontPx, TEXT_BAND_1P, TEXT_BAND_LOW } from './layout'
import { TITLE_FONT_FAMILY } from './fonts'
import { getPlayerMode } from '../game/playerMode'
import type { PlayerMode } from '../game/playerMode'
import { offerButton, endButtonsLive, registerEndButtonReset } from './cardScreen'
import { drawSettingsGear } from './settingsPanel'
import { scaled } from './textScale'

// ─── Motion buttons (persistent instances reused across frames) ───────────────
// Geometry comes from layout.ts (raised-hand zones). Every screen has an entry lockout with a
// release latch (updateGated), and resolves at most one action per frame (updateExclusive).

const startSet = new ButtonSet()
const summarySet = new ButtonSet()
let lastSummaryMs = Number.POSITIVE_INFINITY // summaryShownMs only grows within a visit; a drop means re-entry
const gameOverSet = new ButtonSet()
const victorySet = new ButtonSet()

/** Every screen ignores motion this long after entry (motion-ui-ergonomics R2.5). */
export const START_INPUT_DELAY_MS = ENTRY_LOCK_MS
const startLock = new EntryLock()
const gameOverLock = new EntryLock()

/** Call when the start screen is (re)entered: restarts the input lock-out and drops stale button fill. */
export function resetStartScreen(): void {
  startLock.reset(); startSet.clear()
}

/** Call when the game enters `gameover`: restarts the lock-out so the flail at death presses nothing. */
export function resetGameOverScreen(): void {
  gameOverLock.reset(); gameOverSet.clear()
}

registerEndButtonReset(() => { gameOverSet.reset(); victorySet.reset() })
// Victory: ignore the buttons briefly so the wave that beat the boss can't trigger them.
let victoryShownAt: number | null = null
const VICTORY_INPUT_DELAY_MS = ENTRY_LOCK_MS
const VICTORY_FADE_MS = 400

/** Font px that keeps `text` inside the central text band (menu text never reaches the button columns). */
/** Readable floor for fitted menu text (R5.1): at 640 px wide nothing is drawn smaller than this. */
export const MIN_TEXT_PX = 12

/** Full-width band for centred titles that sit outside the button columns' vertical range. */
const WIDE_BAND: readonly [number, number] = [0.05, 0.95]
/** The stage-summary table spans 28 % … 72 % of the width. */
const ROW_BAND: readonly [number, number] = [0.28, 0.72]

function fit(text: string, px: number, W: number, band: readonly [number, number] = TEXT_BAND_1P): number {
  return Math.round(fitFontPx(text, px, (band[1] - band[0]) * W, MIN_TEXT_PX))
}

// ─── Start screen ─────────────────────────────────────────────────────────────

export function renderStartScreen(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  onStart: (mode: PlayerMode) => void,
  opts: { gear?: boolean } = {},
): void {
  const { width: W, height: H } = ctx.canvas

  // Dark overlay
  ctx.save()
  ctx.fillStyle = 'rgba(13, 0, 20, 0.88)'
  ctx.fillRect(0, 0, W, H)

  // Title
  ctx.textAlign = 'center'
  ctx.font = `${fit('👻 EXORCISE', clamp(W / 8, 56, 120), W, TEXT_BAND_LOW)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ff6b1a'
  ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 24
  ctx.fillText('👻 EXORCISE', W / 2, H * 0.58)

  // Subtitle
  const sub = 'Swat the ghosts with your hands!'
  ctx.font = `${fit(sub, clamp(W / 28, 18, 28), W, TEXT_BAND_LOW)}px sans-serif`
  ctx.fillStyle = '#e8e8f0'; ctx.shadowBlur = 0
  ctx.fillText(sub, W / 2, H * 0.68)

  // High score
  if (state.highScore > 0) {
    ctx.font = `bold ${fit(`Best: ${state.highScore}`, clamp(W / 36, 16, 22), W, TEXT_BAND_LOW)}px sans-serif`
    ctx.fillStyle = '#ffd166'
    ctx.fillText(`Best: ${state.highScore}`, W / 2, H * 0.77)
  }

  // Mode buttons in the raised-hand columns: 1 PLAYER at the left edge, 2 PLAYERS at the right
  // edge (layout.ts). The remembered mode is ringed. Entry is signalled by resetStartScreen();
  // the first render after it starts the lock-out, with the release latch.
  const specs = buttonLayout('start', W, H)
  const [startBtn, twoBtn] = startSet.sync(specs)
  const live = startLock.touch(now)
  const won = updateExclusive([startBtn, twoBtn], now, live)
  startBtn.render(ctx, now)
  twoBtn.render(ctx, now)
  const last = getPlayerMode()
  const ring = last === 1 ? startBtn : twoBtn
  ctx.beginPath()
  ctx.arc(ring.cx, ring.cy, ring.radius + 12, 0, Math.PI * 2)
  ctx.strokeStyle = '#ff6b1a'; ctx.lineWidth = 3; ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 10
  ctx.stroke()

  // Instruction
  const hintLines = ['Wave a hand over a glowing circle', 'or press 1 / 2  •  Space = last mode']
  const hintPx = Math.min(...hintLines.map((l) => fit(l, clamp(W / 40, 13, 18), W, TEXT_BAND_LOW)))
  ctx.font = `${hintPx}px sans-serif`
  ctx.fillStyle = 'rgba(232,232,240,0.6)'; ctx.shadowBlur = 0
  hintLines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.9 + i * hintPx * 1.3))

  ctx.restore()
  if (opts.gear !== false) drawSettingsGear(ctx) // settings panel entry (key O); not drawn in demo mode

  if (won === 0) onStart(1)
  else if (won === 1) onStart(2)
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
  ctx.font = `${fit(cfg.name, clamp(W / 11, 42, 80), W, WIDE_BAND)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ff6b1a'
  ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 20
  ctx.fillText(cfg.name, W / 2 + pose.nameX * W, H * 0.38)

  ctx.font = `${fit(cfg.subtitle, clamp(W / 20, 24, 40), W, WIDE_BAND)}px sans-serif`
  ctx.fillStyle = '#ffd166'; ctx.shadowBlur = 0
  ctx.fillText(cfg.subtitle, W / 2 + pose.subX * W, H * 0.52)

  // Stage 6: one hint line per new ghost, each led by its state icon (more-content R5.3)
  const hints = stageHints(state)
  const countY = hints.length > 0 ? 0.6 : 0.7
  ctx.font = `bold ${fit(String(secs), clamp(W / 12, 40, 72), W, WIDE_BAND)}px monospace`
  ctx.fillStyle = '#e8e8f0'
  ctx.fillText(String(secs), W / 2, H * countY)
  if (hints.length > 0) {
    const px = Math.min(...hints.map((l) => fit(l, clamp(W / 40, 14, 22), W, TEXT_BAND_LOW)))
    ctx.font = `bold ${px}px sans-serif`
    ctx.fillStyle = '#ffd166'
    hints.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.72 + i * px * 1.5))
  }

  ctx.restore()
}

/** Hint lines of the stage title card (none for the bonus round or stages without new ghosts). */
export function stageHints(state: Pick<GameState, 'stage' | 'bonus'>): readonly string[] {
  if (state.bonus) return []
  return STAGES[state.stage - 1]?.hints ?? []
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
  const banner = state.bonus ? 'BONUS CLEAR!' : 'STAGE CLEAR!'
  ctx.font = `${fit(banner, clamp(W / 11, 38, 68) * 0.9, W)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14
  ctx.fillText(banner, 0, 0)
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd166'
  ctx.shadowBlur = 0
  ctx.font = `${fit('⭐'.repeat(stars) + '☆'.repeat(3 - stars), clamp(W / 12, 36, 60), W)}px sans-serif`
  ctx.globalAlpha = outroRowAlpha(state.summaryShownMs, 0)
  ctx.fillText('⭐'.repeat(stars) + '☆'.repeat(3 - stars), W / 2, H * 0.3)

  const rows = [
    [`Banished`, `${state.stageBanished}`],
    [`Missed`,   `${state.stageMissed}`],
    [`Best combo`, `x${state.bestCombo}`],
    [`Score`,    `${state.score}`],
  ]
  const rowH = H * 0.08
  let ry = H * 0.5
  ctx.font = `${fit('Best combo   123456', clamp(W / 30, 16, 24), W, ROW_BAND)}px sans-serif`
  rows.forEach(([label, val], i) => {
    ctx.globalAlpha = outroRowAlpha(state.summaryShownMs, i + 1)
    ctx.fillStyle = 'rgba(232,232,240,0.7)'; ctx.textAlign = 'left'
    ctx.fillText(label, W * 0.28, ry)
    ctx.fillStyle = '#ffd166'; ctx.textAlign = 'right'
    ctx.fillText(val, W * 0.72, ry)
    ry += rowH
  })
  ctx.globalAlpha = 1 // the NEXT button is never faded (it ignores motion for the entry lockout only)

  // Next button: raised-hand zone, entry lockout with release latch (summaryShownMs is deltaMs-based)
  if (state.summaryShownMs < lastSummaryMs) summarySet.clear() // fresh buttons on entry, like the other screens
  lastSummaryMs = state.summaryShownMs
  const [nextBtn] = summarySet.sync(buttonLayout('summary', W, H))
  const won = updateExclusive([nextBtn], now, state.summaryShownMs >= ENTRY_LOCK_MS)
  nextBtn.render(ctx, now)
  ctx.restore()

  if (won === 0) onNext()
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
  const goPx = fit('GAME OVER', clamp(W / 8, 56, 100), W)
  ctx.font = `${goPx}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#c0392b'; ctx.shadowColor = '#c0392b'; ctx.shadowBlur = 24
  ctx.fillText('GAME OVER', W / 2, H * 0.28)
  if (state.lives > 0) {
    // Lives remain, so the stage timer ran out with the boss alive (boss-phases R6.5).
    ctx.shadowBlur = 0
    ctx.font = `bold ${fit("TIME'S UP", clamp(W / 28, 18, 30), W)}px sans-serif`
    ctx.fillStyle = '#ff6b1a'
    ctx.fillText("TIME'S UP", W / 2, H * 0.35)
    ctx.font = `${goPx}px ${TITLE_FONT_FAMILY}`
    ctx.fillStyle = '#c0392b'
  }

  ctx.shadowBlur = 0
  ctx.font = `bold ${fit(`Score: ${state.score}`, clamp(W / 22, 22, 36), W)}px sans-serif`
  ctx.fillStyle = '#ffd166'
  ctx.fillText(`Score: ${state.score}`, W / 2, H * 0.42)
  if (state.highScore > state.score) {
    ctx.font = `${fit(`Best: ${state.highScore}`, clamp(W / 34, 14, 20), W)}px sans-serif`
    ctx.fillStyle = 'rgba(232,232,240,0.6)'
    ctx.fillText(`Best: ${state.highScore}`, W / 2, H * 0.51)
  }

  // Buttons in the raised-hand columns: card offer and retry stacked on the left, MENU alone on the
  // right (it abandons the run: longer dwell). One action per frame, offer > retry > menu.
  const specs = buttonLayout('gameover', W, H)
  const cardBtn = offerButton(specs[0])
  const [retryBtn, menuBtn] = gameOverSet.sync(specs.slice(1))
  const live = gameOverLock.touch(now) && endButtonsLive(now)
  const won = updateExclusive([cardBtn, retryBtn, menuBtn], now, live)
  cardBtn.render(ctx, now)
  retryBtn.render(ctx, now)
  menuBtn.render(ctx, now)

  ctx.restore()

  if (won === 0) onCard?.()
  else if (won === 1) onRetry()
  else if (won === 2) onMenu()
}

// ─── Victory (boss-phases R6.3) ──────────────────────────────────────────────

/** Call once when the game enters `victory`: restarts the banner and input lockout. */
export function resetVictoryScreen(): void {
  victoryShownAt = null
  victorySet.clear()
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
  ctx.font = `${fit('YOU WIN!', clamp(W / 7, 56, 120), W)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 28
  ctx.fillText('YOU WIN!', 0, 0)
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.shadowBlur = 0
  const tag = 'The ghosts have been exorcised 🎃'
  ctx.font = `${fit(tag, clamp(W / 26, 18, 30), W, TEXT_BAND_LOW)}px sans-serif`
  ctx.fillStyle = '#e8e8f0'
  ctx.fillText(tag, W / 2, H * 0.53)
  ctx.font = `bold ${fit(`Total score: ${state.score}`, clamp(W / 18, 26, 44), W)}px sans-serif`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 12
  ctx.fillText(`Total score: ${state.score}`, W / 2, H * 0.38)
  ctx.shadowBlur = 0
  if (state.highScore > state.score) {
    ctx.font = `${fit(`Best: ${state.highScore}`, clamp(W / 34, 14, 20), W)}px sans-serif`
    ctx.fillStyle = 'rgba(232,232,240,0.6)'
    ctx.fillText(`Best: ${state.highScore}`, W / 2, H * 0.6)
  }

  // Same zones as game over: card offer and PLAY AGAIN stacked on the left, MAIN MENU alone on the right.
  // Buttons ignore motion (and must be left) until the entry lockout ends.
  const specs = buttonLayout('victory', W, H)
  const cardBtn = offerButton(specs[0])
  const [againBtn, menuBtn] = victorySet.sync(specs.slice(1))
  const live = t >= VICTORY_INPUT_DELAY_MS
  const won = updateExclusive([cardBtn, againBtn, menuBtn], now, live && endButtonsLive(now))
  cardBtn.render(ctx, now)
  againBtn.render(ctx, now)
  menuBtn.render(ctx, now)
  ctx.restore()

  if (won === 0) onCard?.()
  else if (won === 1) onPlayAgain()
  else if (won === 2) onMenu()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamped size times the text scale setting (playtest-polish R9). Menu text goes through `fit`, which keeps it in its band. */
function clamp(v: number, min: number, max: number): number {
  return scaled(Math.max(min, Math.min(max, Math.round(v))))
}

function calcStars(state: GameState): number {
  if (state.stageMissed === 0 && state.lives === 3) return 3
  if (state.stageMissed <= 1 || state.lives >= 2) return 2
  return 1
}
