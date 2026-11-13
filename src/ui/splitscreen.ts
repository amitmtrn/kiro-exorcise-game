/**
 * Two-player screens and overlays (canvas, procedural): the divider, OUT /
 * CLEARED seat overlays, the shared stage summary and the end screen with the
 * winner. Spec: two-player R1.5, R4, R5.
 */

import type { TwoPlayerState } from '../game/twoPlayer'
import { winnerOf } from '../game/twoPlayer'
import { MotionButton } from './motionButton'
import { TITLE_FONT_FAMILY } from './fonts'
import { SUMMARY_AUTO_ADVANCE_MS } from '../game/state'
import type { Seat } from '../game/halves'

const FINAL_INPUT_DELAY_MS = 1500
const FINAL_FADE_MS = 400

let nextBtn: MotionButton | null = null
let againBtn: MotionButton | null = null
let menuBtn: MotionButton | null = null
let finalShownAt: number | null = null

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)))
}

/** Banner text for the end screen (pure, tested). */
export function winnerText(w: Seat | 'tie'): string {
  return w === 'tie' ? "IT'S A TIE!" : `PLAYER ${w + 1} WINS!`
}

/** Call once when the game enters `final`: restarts the banner and the input lock-out. */
export function resetFinalScreen(): void {
  finalShownAt = null
  againBtn = null // drop any half-filled button state from an earlier visit
  menuBtn = null
}

/** Call once when the game enters `summary`: a fresh NEXT button (no stale fill). */
export function resetSummaryScreen(): void {
  nextBtn = null
}

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

/** Shared stage summary: both players' stage stats side by side, motion NEXT. */
export function renderTwoPlayerSummary(
  ctx: CanvasRenderingContext2D, t: TwoPlayerState, now: number, onNext: () => void,
): void {
  const { width: W, height: H } = ctx.canvas
  const fade = Math.min(1, t.summaryShownMs / 400)
  ctx.save()
  ctx.fillStyle = `rgba(13,0,20,${0.82 * fade})`
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.font = `${clamp(W / 11, 38, 68)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14
  ctx.fillText(t.seats.some((s) => s.bonus) ? 'BONUS CLEAR!' : 'STAGE CLEAR!', W / 2, H * 0.18)
  ctx.shadowBlur = 0

  t.seats.forEach((s, i) => {
    const cx = W * (i === 0 ? 0.25 : 0.75)
    const out = s.phase === 'gameover'
    ctx.textAlign = 'center'
    ctx.font = `bold ${clamp(W / 28, 18, 32)}px sans-serif`
    ctx.fillStyle = out ? '#c0392b' : '#e8e8f0'
    ctx.fillText(out ? `PLAYER ${i + 1} — OUT` : `PLAYER ${i + 1}`, cx, H * 0.3)
    // An out seat's per-stage stats are from the stage it died in: show only its score.
    const rows: Array<[string, string]> = out
      ? [['Score', `${s.score}`]]
      : [['Banished', `${s.stageBanished}`], ['Missed', `${s.stageMissed}`],
         ['Best combo', `x${s.bestCombo}`], ['Score', `${s.score}`]]
    ctx.font = `${clamp(W / 40, 14, 22)}px sans-serif`
    rows.forEach(([label, val], r) => {
      const y = H * (0.4 + r * 0.08)
      ctx.fillStyle = 'rgba(232,232,240,0.7)'; ctx.textAlign = 'left'
      ctx.fillText(label, cx - W * 0.1, y)
      ctx.fillStyle = '#ffd166'; ctx.textAlign = 'right'
      ctx.fillText(val, cx + W * 0.1, y)
    })
  })

  if (!nextBtn || nextBtn.cx !== W / 2 || nextBtn.cy !== H * 0.84) {
    nextBtn = new MotionButton(W / 2, H * 0.84, clamp(W / 8, 50, 80), '▶ NEXT')
  }
  const res = nextBtn.update(now)
  nextBtn.render(ctx, now)
  // auto-advance hint
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(232,232,240,0.5)'
  ctx.font = `${clamp(W / 50, 12, 16)}px sans-serif`
  ctx.fillText(`${Math.max(0, Math.ceil((SUMMARY_AUTO_ADVANCE_MS - t.summaryShownMs) / 1000))}`, W / 2, H * 0.95)
  ctx.restore()
  if (res === 'triggered') onNext()
}

/** End screen: both scores, the winner (or tie), PLAY AGAIN / MAIN MENU. */
export function renderTwoPlayerFinal(
  ctx: CanvasRenderingContext2D, t: TwoPlayerState, now: number, onAgain: () => void, onMenu: () => void,
): void {
  const { width: W, height: H } = ctx.canvas
  if (finalShownAt === null) finalShownAt = now
  const el = now - finalShownAt
  const w = winnerOf(t)

  ctx.save()
  ctx.fillStyle = `rgba(13,0,20,${0.88 * Math.min(1, el / FINAL_FADE_MS)})`
  ctx.fillRect(0, 0, W, H)

  // Wobble-in winner banner
  const k = Math.min(1, el / 700)
  ctx.save()
  ctx.translate(W / 2, H * 0.2)
  ctx.rotate(Math.sin(el / 90) * (1 - k) * 0.25)
  ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k)
  ctx.textAlign = 'center'
  ctx.font = `${clamp(W / 9, 44, 110)}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ff6b1a'; ctx.shadowBlur = 28
  ctx.fillText(winnerText(w), 0, 0)
  ctx.restore()

  ctx.shadowBlur = 0
  t.seats.forEach((s, i) => {
    const cx = W * (i === 0 ? 0.3 : 0.7)
    const isWinner = w === i
    ctx.textAlign = 'center'
    ctx.font = `bold ${clamp(W / 26, 18, 34)}px sans-serif`
    ctx.fillStyle = isWinner ? '#ffd166' : '#e8e8f0'
    ctx.fillText(`PLAYER ${i + 1}${isWinner ? ' 👑' : ''}`, cx, H * 0.4)
    ctx.font = `bold ${clamp(W / 14, 28, 64)}px sans-serif`
    ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = isWinner ? 16 : 0
    ctx.fillText(`${s.score}`, cx, H * 0.53)
    ctx.shadowBlur = 0
    if (s.phase === 'gameover') {
      ctx.font = `${clamp(W / 40, 14, 22)}px sans-serif`
      ctx.fillStyle = '#c0392b'
      ctx.fillText('out of lives', cx, H * 0.6)
    }
  })

  const r = clamp(W / 9, 48, 76)
  if (!againBtn || againBtn.radius !== r) againBtn = new MotionButton(W * 0.35, H * 0.78, r, 'PLAY AGAIN')
  else { againBtn.cx = W * 0.35; againBtn.cy = H * 0.78 }
  if (!menuBtn || menuBtn.radius !== r) menuBtn = new MotionButton(W * 0.65, H * 0.78, r, 'MAIN MENU')
  else { menuBtn.cx = W * 0.65; menuBtn.cy = H * 0.78 }
  const live = el >= FINAL_INPUT_DELAY_MS
  const r1 = live ? againBtn.update(now) : null
  againBtn.render(ctx, now)
  const r2 = live ? menuBtn.update(now) : null
  menuBtn.render(ctx, now)
  ctx.restore()

  if (!live) return
  if (r1 === 'triggered') onAgain()
  else if (r2 === 'triggered') onMenu()
}
