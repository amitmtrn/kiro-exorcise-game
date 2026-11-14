/**
 * Motion button — a circular canvas button triggered by sustained hand motion.
 * Uses lastMotionPixels from collision.ts (the whole-frame motion mask in
 * display space, published every tick) to detect motion inside the circle.
 */

import { getPalette } from './palette'
import { getSettings } from '../settings/runtime'
import { RING_OUTSET, fitFontPx } from './layout'
import { lastMotionPixels, motionFrameSeq, motionCell } from '../game/collision'
import { sfxConfirm } from '../audio/sfx'

/** A soft confirm sound for a fired motion button (playtest2-fixes R4.2); never throws. */
export function playConfirm(): void {
  try { sfxConfirm() } catch { /* audio not ready */ }
}

/** Where a button reads its motion points (display space of its own canvas). */
export type PointSource = () => ReadonlyArray<{ x: number; y: number }>

/** Accumulated on-target time that presses a normal button (motion-ui-ergonomics R2.1). */
export const DWELL_MS = 650
/** Longer dwell for destructive / side-effect buttons: SAVE, MENU (R3.1). */
export const DESTRUCTIVE_DWELL_MS = 1000
/** Kept for older callers: the normal dwell. */
export const FILL_DURATION_MS = DWELL_MS
/** Fraction of the circle's area the moved samples must cover for a frame to count (R2.2). */
export const MIN_COVERAGE = 0.12
/** Absolute floor of moved samples inside the circle, whatever the circle size. */
export const MIN_MOTION_PIXELS = 3
/** Off-target drain speed relative to the fill speed (> 1: sway never accumulates). */
export const DECAY_RATE = 1.5
/** Time credited between two real camera frames is capped (a stalled camera cannot fill a button). */
export const MAX_FRAME_GAP_MS = 120
/** After a trigger the circle must be still this long before it can fill again (one wave = one action). */
export const RELEASE_STILL_MS = 150
/** Buttons whose centres are within this many radii compete for one hand (stacked buttons are 3.1 radii apart). */
export const NEIGHBOUR_RADII = 4
/** Every screen ignores motion this long after it is entered (R2.5). */
export const ENTRY_LOCK_MS = 1200

export type ButtonStatus = 'idle' | 'filling' | 'triggered'

export class MotionButton {
  cx: number
  cy: number
  radius: number
  label: string
  /** On-target time accumulated so far, 0 … dwellMs. */
  private progress = 0
  private lastEvalAt = Number.NEGATIVE_INFINITY
  private lastActiveAt = Number.NEGATIVE_INFINITY
  private wasActive = false
  private lastSeq = motionFrameSeq
  /** After a trigger (or while not live) the button ignores motion until it has left the circle. */
  private awaitRelease = false
  readonly dwellMs: number

  /**
   * Optional point source. Default: the whole-frame mask. A two-player button reads
   * only the points of its own half (two-player-card R1.3).
   */
  private source: PointSource | null

  constructor(
    cx: number, cy: number, radius: number, label: string,
    source: PointSource | null = null, dwellMs: number = DWELL_MS,
  ) {
    this.source = source
    this.cx = cx
    this.cy = cy
    this.radius = radius
    this.label = label
    this.dwellMs = dwellMs
  }

  /** Moved samples inside the circle. */
  private inside(limit = Number.POSITIVE_INFINITY): number {
    let inside = 0
    const r2 = this.radius * this.radius
    for (const mp of this.source ? this.source() : lastMotionPixels) {
      const dx = mp.x - this.cx
      const dy = mp.y - this.cy
      if (dx * dx + dy * dy < r2 && ++inside >= limit) break
    }
    return inside
  }

  /** Moved samples needed inside the circle for a frame to count (R2.2). */
  private need(): number {
    const cellArea = Math.max(1e-6, motionCell.w * motionCell.h)
    return Math.max(MIN_MOTION_PIXELS, Math.ceil((MIN_COVERAGE * Math.PI * this.radius * this.radius) / cellArea))
  }

  /** True when the moved samples cover enough of the circle (R2.2). */
  private covered(): boolean {
    const need = this.need()
    return this.inside(need) >= need
  }

  /**
   * How far the circle is covered by the current motion, as a multiple of what a frame needs: 1 or more counts.
   * Neighbouring buttons compare these so the one the hand is mostly on wins (playtest1-fixes R2.2).
   */
  coverageScore(): number {
    return this.inside() / this.need()
  }

  /**
   * Call each tick. Only a real new camera frame changes anything; a duplicate frame
   * returns the previous status (R2.4). 'triggered' is returned once per wave.
   */
  update(now: number, allow = true): ButtonStatus {
    const seq = motionFrameSeq
    if (seq === this.lastSeq) return this.progress > 0 && !this.awaitRelease ? 'filling' : 'idle'
    this.lastSeq = seq
    const dt = Number.isFinite(this.lastEvalAt) ? Math.max(0, Math.min(MAX_FRAME_GAP_MS, now - this.lastEvalAt)) : 0
    this.lastEvalAt = now
    const active = allow && this.covered()
    const wasActive = this.wasActive
    this.wasActive = active
    if (active) this.lastActiveAt = now

    if (this.awaitRelease) {
      if (active || now - this.lastActiveAt <= RELEASE_STILL_MS) { this.progress = 0; return 'idle' }
      this.awaitRelease = false
    }

    if (active) {
      if (wasActive) this.progress += dt // the first active frame after a gap only restarts the clock
      if (this.progress >= this.dwellMs) {
        this.progress = 0
        this.awaitRelease = true // one wave = one trigger (exorcist-card R1.2)
        return 'triggered'
      }
    } else {
      // No grace: every off frame drains, so on/off patterns with off >= on never net-fill (R2.3).
      this.progress = Math.max(0, this.progress - dt * DECAY_RATE)
    }
    return this.progress > 0 ? 'filling' : 'idle'
  }

  /** Like `update`, but while `live` is false motion is ignored and must leave the circle first. */
  updateGated(now: number, live: boolean, allow = true): ButtonStatus {
    if (!live) { this.awaitRelease = true; this.progress = 0 }
    return this.update(now, allow)
  }

  /** Drops the fill and requires the hand to leave (another button won this frame). */
  suppress(): void {
    this.progress = 0
    this.awaitRelease = true
  }

  /** Forgets any partial fill (screen changed under the button). */
  reset(): void {
    this.progress = 0
    this.awaitRelease = false
    this.wasActive = false
    this.lastEvalAt = Number.NEGATIVE_INFINITY
    this.lastActiveAt = Number.NEGATIVE_INFINITY
    this.lastSeq = motionFrameSeq
  }

  fillProgress(_now?: number): number {
    return Math.min(1, this.progress / this.dwellMs)
  }

  render(ctx: CanvasRenderingContext2D, now: number): void {
    const progress = this.fillProgress(now)
    const destructive = this.dwellMs > DWELL_MS
    const cb = getSettings().cb
    const pal = getPalette()

    ctx.save()

    // Background circle
    ctx.beginPath()
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(42, 8, 69, 0.75)'
    ctx.fill()
    ctx.strokeStyle = cb ? pal.ringIdle : 'rgba(255, 107, 26, 0.6)'
    ctx.lineWidth = 3
    // Colourblind palette: the ring state is also a pattern (idle dotted, filling solid, destructive dashed)
    if (cb) { ctx.globalAlpha = 0.85; ctx.setLineDash(progress > 0 ? [] : [3, 7]) }
    ctx.stroke()
    if (cb) { ctx.globalAlpha = 1; ctx.setLineDash([]) }

    // Fill arc
    if (progress > 0) {
      ctx.beginPath()
      ctx.moveTo(this.cx, this.cy)
      ctx.arc(this.cx, this.cy, this.radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
      ctx.closePath()
      ctx.fillStyle = cb ? pal.ringIdle : 'rgba(255, 107, 26, 0.45)'
      if (cb) ctx.globalAlpha = 0.45
      ctx.fill()
      if (cb) ctx.globalAlpha = 1
    }

    // Progress ring: always visible as a faint track, bright while filling
    ctx.beginPath()
    ctx.arc(this.cx, this.cy, this.radius + RING_OUTSET - 3, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.25)'
    ctx.lineWidth = 4
    ctx.stroke()
    if (progress > 0) {
      ctx.beginPath()
      ctx.arc(this.cx, this.cy, this.radius + RING_OUTSET - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
      ctx.strokeStyle = cb ? (destructive ? pal.ringDanger : pal.ringFill) : (destructive ? '#c0392b' : '#39ff14')
      ctx.lineWidth = 6
      if (cb && destructive) ctx.setLineDash([12, 6])
      ctx.stroke()
      if (cb) ctx.setLineDash([])
    }

    // Label
    ctx.fillStyle = '#ffd166'
    const lines = this.label.split('\n')
    const longest = lines.reduce((a, b) => ([...b].length > [...a].length ? b : a), '')
    // fit the widest line to the circle (R5.1); small radii shrink the text instead of overflowing
    const fontPx = Math.round(fitFontPx(longest, Math.max(11, this.radius * 0.28), this.radius * 2))
    ctx.font = `bold ${fontPx}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = '#ffd166'
    ctx.shadowBlur = 8
    const lh = fontPx * 1.15
    lines.forEach((ln, i) => ctx.fillText(ln, this.cx, this.cy + (i - (lines.length - 1) / 2) * lh))

    ctx.restore()
  }
}

/**
 * Entry lockout shared by every screen (R2.5): not live until ENTRY_LOCK_MS after the
 * first `touch` since `reset()`. Screens pass the result to `updateGated`, which also arms the
 * release latch, so a wave that continues past the lockout must leave the circle first.
 */
export class EntryLock {
  private enteredAt: number | null = null
  reset(): void { this.enteredAt = null }
  /** Milliseconds since the screen was entered (0 before the first `touch`). */
  since(now: number): number { return this.enteredAt === null ? 0 : now - this.enteredAt }
  /** Call every rendered frame; true when buttons may read motion. */
  touch(now: number): boolean {
    if (this.enteredAt === null) this.enteredAt = now
    return now - this.enteredAt >= ENTRY_LOCK_MS
  }
}

/**
 * Updates a group of buttons and resolves at most one action per frame (R2.7). Order = priority:
 * safe actions first, destructive last. The winner is the index of the first button that
 * triggered; every other button is suppressed (progress dropped, latch armed).
 * `lives` is one flag for all buttons or one per button. Returns -1 when none triggered.
 */
export function updateExclusive(
  buttons: readonly MotionButton[], now: number, lives: boolean | readonly boolean[],
): number {
  const liveOf = (i: number): boolean => (typeof lives === 'boolean' ? lives : lives[i])
  // When one hand covers two neighbouring buttons only the one it covers most may count the frame; a clipped
  // neighbour sees an inactive frame (it drains and cannot fire). Ties go to list order. Only buttons within
  // NEIGHBOUR_RADII radii of each other compete: the two halves of a 2P screen stay independent.
  const scores = buttons.map((b, i) => (liveOf(i) ? b.coverageScore() : 0))
  const allowed = buttons.map((b, i) => scores[i] < 1 || !buttons.some((o, j) =>
    j !== i && scores[j] >= 1 &&
    Math.hypot(o.cx - b.cx, o.cy - b.cy) <= NEIGHBOUR_RADII * Math.max(o.radius, b.radius) &&
    (scores[j] > scores[i] || (scores[j] === scores[i] && j < i))))
  let winner = -1
  buttons.forEach((b, i) => {
    if (b.updateGated(now, liveOf(i), allowed[i]) === 'triggered' && winner < 0) winner = i
  })
  if (winner >= 0) {
    buttons.forEach((b, i) => { if (i !== winner) b.suppress() })
    playConfirm() // every screen's motion buttons resolve here, so each fire sounds exactly once
  }
  return winner
}
