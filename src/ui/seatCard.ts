/**
 * Per-half Exorcist Card controls for the two-player end screen (two-player-card R1).
 *
 * A `SeatCard` draws on its own half-sized, transparent canvas: the "EXORCIST CARD" offer
 * button, or the preview (SAVE / NO PHOTO / CLOSE) once chosen. Everything is in half-local
 * coordinates and its buttons read only the motion points handed in for that half, so a wave
 * in the other half cannot reach them. Clicks are routed to a half by `routeSeatClick`.
 */

import type { PointSource } from './motionButton'
import { ButtonSet } from './buttonSet'
import { areaButtons } from './layout'
import { CardPreview, PREVIEW_INPUT_DELAY_MS } from './cardScreen'
import type { CardAction } from './cardScreen'
import { halfOffset, halfWidth } from '../game/halves'
import type { Seat } from '../game/halves'

/** Offer button geometry (half-local) from the layout: stacked column of the half, row B. */
export function seatOfferGeometry(hw: number, H: number, seat: Seat = 0): { cx: number; cy: number; r: number } {
  const o = areaButtons('final2p', hw, H, seat).find((b) => b.id === 'offer')!
  return { cx: o.cx, cy: o.cy, r: o.r }
}

/**
 * How long an open preview keeps the OTHER half's shared buttons (NEXT / PLAY AGAIN / MAIN MENU) inactive.
 * After this the other player can leave even if the first never closes their card (R4.3).
 */
export const PREVIEW_LOCK_MAX_MS = 20_000

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

/**
 * Which halves' shared buttons (PLAY AGAIN / MAIN MENU) may read motion, per half. Must be computed after
 * both cards rendered this frame: an offer that just opened makes `isOpen` true, so it wins the frame over
 * the shared buttons (motion-ui-ergonomics R2.7).
 */
export function sharedButtonsLive(
  cards: readonly [{ isOpen: boolean; lockedUntil: number; blocksOtherHalf(now: number): boolean },
    { isOpen: boolean; lockedUntil: number; blocksOtherHalf(now: number): boolean }],
  now: number,
): [boolean, boolean] {
  return [0, 1].map((s) =>
    !cards[s].isOpen && now >= cards[s].lockedUntil && !cards[1 - s].blocksOtherHalf(now)) as [boolean, boolean]
}

export class SeatCard<C extends CanvasImageSource> {
  private readonly preview: CardPreview
  private offer: ButtonSet
  private clicks: Array<{ x: number; y: number }> = []
  private liveAt = 0
  private lastOffer = { cx: -1, cy: -1, r: 0 }
  private openedAt = Number.NEGATIVE_INFINITY

  constructor(readonly seat: Seat, private session: SeatSession<C>, source: PointSource) {
    this.offer = new ButtonSet(source)
    this.preview = new CardPreview(source, seat)
  }

  get isOpen(): boolean { return this.session.isOpen }
  /** Time before which the shared end buttons must ignore motion (after this card opened / closed). */
  get lockedUntil(): number { return this.liveAt }
  /** True while this half's open preview still holds the other half's shared buttons (at most PREVIEW_LOCK_MAX_MS). */
  blocksOtherHalf(now: number): boolean { return this.session.isOpen && now - this.openedAt < PREVIEW_LOCK_MAX_MS }

  /** Queues a click in half-local coordinates (applied on the next `render`). */
  queueClick(x: number, y: number): void { this.clicks.push({ x, y }) }

  /** Forgets queued clicks and the partial fill (screen changed). */
  reset(): void {
    this.clicks = []
    this.offer.reset()
    this.liveAt = 0
    this.openedAt = Number.NEGATIVE_INFINITY
  }

  private lock(now: number): void {
    this.liveAt = now + PREVIEW_INPUT_DELAY_MS
    this.offer.reset()
  }

  private run(a: CardAction | 'open', now: number): void {
    if (a === 'open') { if (this.session.open()) { this.preview.open(now); if (this.openedAt === Number.NEGATIVE_INFINITY) this.openedAt = now; this.lock(now) } }
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

    const spec = areaButtons('final2p', hw, H, this.seat).find((b) => b.id === 'offer')!
    this.lastOffer = { cx: spec.cx, cy: spec.cy, r: spec.r }
    const [btn] = this.offer.sync([spec])
    const res = btn.updateGated(now, live && now >= this.liveAt)
    btn.render(ctx, now)
    if (res === 'triggered') this.run('open', now)
  }

  /** Closes the preview without touching the snapshot (the game left the end screen). */
  closePreview(): void {
    if (this.session.isOpen) this.session.close()
    this.reset()
  }
}
