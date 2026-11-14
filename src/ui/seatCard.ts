/**
 * Per-half Exorcist Card controls for the two-player end screen (two-player-card R1).
 *
 * A `SeatCard` draws on its own half-sized, transparent canvas: the "EXORCIST CARD" offer
 * button, or the preview (SAVE / NO PHOTO / CLOSE) once chosen. Everything is in half-local
 * coordinates and its buttons read only the motion points handed in for that half, so a wave
 * in the other half cannot reach them. Clicks are routed to a half by `routeSeatClick`.
 */

import { MotionButton } from './motionButton'
import type { PointSource } from './motionButton'
import { CardPreview, PREVIEW_INPUT_DELAY_MS } from './cardScreen'
import type { CardAction } from './cardScreen'
import { halfOffset, halfWidth } from '../game/halves'
import type { Seat } from '../game/halves'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)))
}

/** Offer button geometry for a half `hw` × `H`: bottom centre of the half, inside it. */
export function seatOfferGeometry(hw: number, H: number): { cx: number; cy: number; r: number } {
  const r = Math.max(1, Math.min(clamp(Math.min(hw / 7, H * 0.06), 36, 52), Math.floor(hw / 2)))
  return { cx: hw / 2, cy: Math.max(r, H - r - 12), r }
}

/**
 * Radius and centre y of the shared PLAY AGAIN / MAIN MENU buttons: in the band between the
 * "out of lives" line (0.6 H, plus its descent) and the per-player offers, shrunk to fit.
 */
export function sharedButtonLayout(hw: number, H: number, wantR: number): { r: number; cy: number } {
  const o = seatOfferGeometry(hw, H)
  const top = H * 0.6 + 12
  const bottom = o.cy - o.r - 8
  const r = Math.max(1, Math.min(wantR, Math.floor((bottom - top) / 2)))
  return { r, cy: (top + bottom) / 2 }
}

/** Which half a click on the full canvas belongs to, and its half-local position. */
export function routeSeatClick(x: number, y: number, W: number): { seat: Seat; x: number; y: number } {
  const seat: Seat = x < halfWidth(W) ? 0 : 1
  return { seat, x: x - halfOffset(seat, W), y }
}

/** The part of `CardSession` a seat card needs. */
export interface SeatSession<C extends CanvasImageSource> {
  readonly isOpen: boolean
  readonly card: C | null
  readonly noPhoto: boolean
  readonly hasPhoto: boolean
  open(): boolean
  close(): void
  togglePhoto(): void
  save(): Promise<void>
  takeStatus(): 'saved' | 'failed' | null
}

export class SeatCard<C extends CanvasImageSource> {
  private readonly preview: CardPreview
  private offer: MotionButton | null = null
  private readonly source: PointSource
  private clicks: Array<{ x: number; y: number }> = []
  private liveAt = 0
  private lastOffer = seatOfferGeometry(1, 1)

  constructor(readonly seat: Seat, private session: SeatSession<C>, source: PointSource) {
    this.source = source
    this.preview = new CardPreview(source)
  }

  get isOpen(): boolean { return this.session.isOpen }
  /** Time before which the shared end buttons must ignore motion (after this card opened / closed). */
  get lockedUntil(): number { return this.liveAt }

  /** Queues a click in half-local coordinates (applied on the next `render`). */
  queueClick(x: number, y: number): void { this.clicks.push({ x, y }) }

  /** Forgets queued clicks and the partial fill (screen changed). */
  reset(): void {
    this.clicks = []
    this.offer?.reset()
    this.liveAt = 0
  }

  private lock(now: number): void {
    this.liveAt = now + PREVIEW_INPUT_DELAY_MS
    this.offer?.reset()
  }

  private run(a: CardAction | 'open', now: number): void {
    if (a === 'open') { if (this.session.open()) { this.preview.open(now); this.lock(now) } }
    else if (a === 'close') { this.session.close(); this.lock(now) }
    else if (a === 'toggle') this.session.togglePhoto()
    else void this.session.save()
  }

  private offerHit(x: number, y: number): boolean {
    const g = this.lastOffer
    const dx = x - g.cx, dy = y - g.cy
    return dx * dx + dy * dy <= g.r * g.r
  }

  /**
   * Draws this half's card layer on `ctx` (half-sized, cleared by the caller), applies queued clicks
   * and any button whose wave just completed. `live === false` shows the offer without reading motion.
   */
  render(ctx: CanvasRenderingContext2D, now: number, live: boolean): void {
    const { width: hw, height: H } = ctx.canvas
    const queue = this.clicks
    this.clicks = []
    for (const c of queue) {
      if (this.session.isOpen) {
        const a = this.preview.hit(c.x, c.y)
        if (a) this.run(a, now)
      } else if (live && now >= this.liveAt && this.offerHit(c.x, c.y)) this.run('open', now)
    }
    const st = this.session.takeStatus()
    if (st) this.preview.setStatus(st === 'saved' ? 'Download started!' : "Couldn't save the card", now)

    if (this.session.isOpen && this.session.card) {
      const a = this.preview.render(ctx, now, this.session.card, this.session.noPhoto, this.session.hasPhoto)
      if (a) this.run(a, now)
      return
    }

    const g = seatOfferGeometry(hw, H)
    this.lastOffer = g
    if (!this.offer) this.offer = new MotionButton(g.cx, g.cy, g.r, '📸 EXORCIST\nCARD', this.source)
    else { this.offer.cx = g.cx; this.offer.cy = g.cy; this.offer.radius = g.r }
    const res = this.offer.updateGated(now, live && now >= this.liveAt)
    this.offer.render(ctx, now)
    if (res === 'triggered') this.run('open', now)
  }

  /** Closes the preview without touching the snapshot (the game left the end screen). */
  closePreview(): void {
    if (this.session.isOpen) this.session.close()
    this.reset()
  }
}
