/**
 * Two-player screens and overlays (canvas, procedural): the divider, OUT /
 * CLEARED seat overlays, the shared stage summary and the end screen with the
 * winner. Spec: two-player R1.5, R4, R5.
 */

import type { TwoPlayerState } from '../game/twoPlayer'
import { winnerOf } from '../game/twoPlayer'
import { EntryLock, ENTRY_LOCK_MS, updateExclusive } from './motionButton'
import type { PointSource } from './motionButton'
import { ButtonSet } from './buttonSet'
import { areaButtons, fitFontPx } from './layout'
import { lastMotionPixels } from '../game/collision'
import { TITLE_FONT_FAMILY } from './fonts'
import { SUMMARY_AUTO_ADVANCE_MS } from '../game/state'
import type { Seat } from '../game/halves'
import { halfWidth, halfOffset, displayPointsInHalf, SEATS } from '../game/halves'

/** Entry lockout of the 2P end screen: the same for every screen (motion-ui-ergonomics R2.5). */
export const FINAL_INPUT_DELAY_MS = ENTRY_LOCK_MS
const FINAL_FADE_MS = 400

/**
 * Per-half copies of the shared buttons (NEXT / PLAY AGAIN / MAIN MENU), each reading only its own half's
 * motion. The action fires when EITHER player completes it deliberately (documented choice, R4.2).
 */
let pointSources: readonly [PointSource, PointSource] | null = null
const halfSource = (seat: Seat, getW: () => number): PointSource => () =>
  pointSources ? pointSources[seat]() : displayPointsInHalf(lastMotionPixels, seat, getW())
let lastW = 0
const nextSets = SEATS.map((seat) => new ButtonSet(halfSource(seat, () => lastW)))
const finalSets = SEATS.map((seat) => new ButtonSet(halfSource(seat, () => lastW)))
const finalLock = new EntryLock()

/** Draws a half's buttons in half-local coordinates at the half's offset on the full canvas. */
function inHalf(ctx: CanvasRenderingContext2D, seat: Seat, W: number, fn: () => void): void {
  ctx.save()
  ctx.translate(halfOffset(seat, W), 0)
  fn()
  ctx.restore()
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)))
}

/** Banner text for the end screen (pure, tested). */
export function winnerText(w: Seat | 'tie'): string {
  return w === 'tie' ? "IT'S A TIE!" : `PLAYER ${w + 1} WINS!`
}

/** Call once when the game enters `final`: restarts the banner and the input lock-out. */
export function resetFinalScreen(): void {
  finalLock.reset()
  for (const s of finalSets) s.clear() // drop any half-filled button state from an earlier visit
}

/** Call once when the game enters `summary`: a fresh NEXT button (no stale fill). */
export function resetSummaryScreen(): void {
  for (const s of nextSets) s.clear()
}

/** Rows of 2P shared text, as fractions of H: all below the button rows (TEXT_TOP_2P). */
const TEXT_Y2P = { title: 0.58, label: 0.68, rows: 0.76 }

/** Orange glowing divider down the middle of the screen (R1.5). */
export function drawDivider(ctx: CanvasRenderingContext2D, x = ctx.canvas.width / 2): void {
  const H = ctx.canvas.height
  ctx.save()
  ctx.strokeStyle = '#ff6b1a'
  ctx.lineWidth = 4
  ctx.shadowColor = '#ff6b1a'
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.moveTo(x, 0)
  ctx.lineTo(x, H)
  ctx.stroke()
  ctx.restore()
}

/** "OUT" / "CLEARED" over one half (drawn on that half's own canvas). */
export function drawSeatOverlay(
  ctx: CanvasRenderingContext2D, kind: 'out' | 'cleared', score: number, now: number,
): void {
  const { width: W, height: H } = ctx.canvas
  const color = kind === 'out' ? '#c0392b' : '#ffd166'
  ctx.save()
  ctx.fillStyle = kind === 'out' ? 'rgba(13,0,20,0.72)' : 'rgba(13,0,20,0.45)'
  ctx.fillRect(0, 0, W, H)
  ctx.translate(W / 2, H * 0.42)
  ctx.rotate(Math.sin(now / 400) * 0.04)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${clamp(W / 4, 48, 130)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 24
  ctx.fillText(kind === 'out' ? 'OUT' : 'CLEARED', 0, 0)
  ctx.rotate(-Math.sin(now / 400) * 0.04)
  ctx.shadowBlur = 0
  ctx.font = `bold ${clamp(W / 14, 18, 40)}px sans-serif`
  ctx.fillStyle = '#ffd166'
  ctx.fillText(`Score: ${score}`, 0, H * 0.2)
  ctx.restore()
}

/**
 * Shared stage summary: both players' stage stats side by side. Text sits below 47 % of the height
 * (under the button rows), and each half has its own NEXT at raised-hand height that reads only
 * that half's motion; either player's deliberate dwell advances (R4.2).
 */
export function renderTwoPlayerSummary(
  ctx: CanvasRenderingContext2D, t: TwoPlayerState, now: number, onNext: () => void,
  sources: readonly [PointSource, PointSource] | null = null,
): void {
  const { width: W, height: H } = ctx.canvas
  pointSources = sources; lastW = W
  const fade = Math.min(1, t.summaryShownMs / 400)
  ctx.save()
  ctx.fillStyle = `rgba(13,0,20,${0.82 * fade})`
  ctx.fillRect(0, 0, W, H)

  const banner = t.seats.some((s) => s.bonus) ? 'BONUS CLEAR!' : 'STAGE CLEAR!'
  ctx.textAlign = 'center'
  ctx.font = `${Math.round(fitFontPx(banner, Math.min(clamp(W / 11, 38, 68), H * 0.11), W * 0.5))}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14
  ctx.fillText(banner, W / 2, H * TEXT_Y2P.title)
  ctx.shadowBlur = 0

  t.seats.forEach((s, i) => {
    const cx = W * (i === 0 ? 0.25 : 0.75)
    const out = s.phase === 'gameover'
    ctx.textAlign = 'center'
    ctx.font = `bold ${Math.min(clamp(W / 28, 18, 32), Math.round(H * 0.05))}px sans-serif`
    ctx.fillStyle = out ? '#c0392b' : '#e8e8f0'
    ctx.fillText(out ? `PLAYER ${i + 1} — OUT` : `PLAYER ${i + 1}`, cx, H * TEXT_Y2P.label)
    // An out seat's per-stage stats are from the stage it died in: show only its score.
    const rows: Array<[string, string]> = out
      ? [['Score', `${s.score}`]]
      : [['Banished', `${s.stageBanished}`], ['Missed', `${s.stageMissed}`],
         ['Best combo', `x${s.bestCombo}`], ['Score', `${s.score}`]]
    ctx.font = `${Math.min(clamp(W / 40, 14, 22), Math.round(H * 0.04))}px sans-serif`
    rows.forEach(([label, val], r) => {
      const y = H * (TEXT_Y2P.rows + r * 0.055)
      ctx.fillStyle = 'rgba(232,232,240,0.7)'; ctx.textAlign = 'left'
      ctx.fillText(label, cx - W * 0.1, y)
      ctx.fillStyle = '#ffd166'; ctx.textAlign = 'right'
      ctx.fillText(val, cx + W * 0.1, y)
    })
  })

  // One NEXT per half (outer column, row A); entry lockout from the deltaMs-based summary timer.
  const hw = halfWidth(W)
  const live = t.summaryShownMs >= ENTRY_LOCK_MS
  const btns = SEATS.map((seat) => nextSets[seat].sync(areaButtons('summary2p', hw, H, seat))[0])
  const won = updateExclusive(btns, now, live)
  SEATS.forEach((seat) => inHalf(ctx, seat, W, () => btns[seat].render(ctx, now)))
  // auto-advance hint
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(232,232,240,0.5)'
  ctx.font = `${clamp(W / 50, 12, 16)}px sans-serif`
  ctx.fillText(`${Math.max(0, Math.ceil((SUMMARY_AUTO_ADVANCE_MS - t.summaryShownMs) / 1000))}`, W / 2, H * 0.975)
  ctx.restore()
  if (won >= 0) onNext()
}

/** End screen: both scores, the winner (or tie), PLAY AGAIN / MAIN MENU copies per half. */
export function renderTwoPlayerFinal(
  ctx: CanvasRenderingContext2D, t: TwoPlayerState, now: number, onAgain: () => void, onMenu: () => void,
  /**
   * Per half: false while that half's card preview is open / just changed, or while the other half's
   * preview holds the shared buttons: they are dimmed and ignore motion (two-player-card R1.7, R4.3).
   */
  buttonsLive: boolean | readonly [boolean, boolean] = true,
  sources: readonly [PointSource, PointSource] | null = null,
): void {
  const { width: W, height: H } = ctx.canvas
  pointSources = sources; lastW = W
  const entryLive = finalLock.touch(now)
  const el = finalLock.since(now)
  const w = winnerOf(t)

  ctx.save()
  ctx.fillStyle = `rgba(13,0,20,${0.88 * Math.min(1, el / FINAL_FADE_MS)})`
  ctx.fillRect(0, 0, W, H)

  // Wobble-in winner banner (below the button rows, so the mute button never covers it)
  const k = Math.min(1, el / 700)
  const text = winnerText(w)
  ctx.save()
  ctx.translate(W / 2, H * TEXT_Y2P.title)
  ctx.rotate(Math.sin(el / 90) * (1 - k) * 0.25)
  ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k)
  ctx.textAlign = 'center'
  ctx.font = `${Math.round(fitFontPx(text, Math.min(clamp(W / 9, 44, 110), H * 0.12), W * 0.8))}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 28
  ctx.fillText(text, 0, 0)
  ctx.restore()

  ctx.shadowBlur = 0
  t.seats.forEach((s, i) => {
    const cx = W * (i === 0 ? 0.3 : 0.7)
    const isWinner = w === i
    ctx.textAlign = 'center'
    ctx.font = `bold ${Math.min(clamp(W / 26, 18, 34), Math.round(H * 0.05))}px sans-serif`
    ctx.fillStyle = isWinner ? '#ffd166' : '#e8e8f0'
    ctx.fillText(`PLAYER ${i + 1}${isWinner ? ' 👑' : ''}`, cx, H * TEXT_Y2P.label)
    ctx.font = `bold ${Math.min(clamp(W / 14, 28, 64), Math.round(H * 0.1))}px sans-serif`
    ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = isWinner ? 16 : 0
    ctx.fillText(`${s.score}`, cx, H * TEXT_Y2P.rows + H * 0.06)
    ctx.shadowBlur = 0
    if (s.phase === 'gameover') {
      ctx.font = `${Math.min(clamp(W / 40, 14, 22), Math.round(H * 0.04))}px sans-serif`
      ctx.fillStyle = '#c0392b'
      ctx.fillText('out of lives', cx, H * 0.96)
    }
  })

  // PLAY AGAIN and MAIN MENU: a copy in each half (outer column row A / inner column, MAIN MENU alone,
  // longer dwell). Priority: PLAY AGAIN before MAIN MENU. Entry lockout + release latch, then one action.
  const hw = halfWidth(W)
  const flags: [boolean, boolean] = typeof buttonsLive === 'boolean' ? [buttonsLive, buttonsLive] : [buttonsLive[0], buttonsLive[1]]
  const sets = SEATS.map((seat) => finalSets[seat].sync(areaButtons('final2p', hw, H, seat).filter((b) => b.id !== 'offer')))
  const again = [sets[0][0], sets[1][0]], menu = [sets[0][1], sets[1][1]]
  const lives = SEATS.map((seat) => entryLive && flags[seat])
  const won = updateExclusive([...again, ...menu], now, [lives[0], lives[1], lives[0], lives[1]])
  for (const seat of SEATS) {
    inHalf(ctx, seat, W, () => {
      ctx.globalAlpha = flags[seat] ? 1 : 0.35
      again[seat].render(ctx, now)
      menu[seat].render(ctx, now)
    })
  }
  ctx.restore()

  if (won === 0 || won === 1) onAgain()
  else if (won === 2 || won === 3) onMenu()
}
