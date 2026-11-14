/**
 * Exorcist Card UI (exorcist-card R1): the "EXORCIST CARD" offer button on the
 * game-over / victory screens and the preview overlay with SAVE / NO PHOTO /
 * CLOSE. Nothing here composes or downloads anything by itself: the loop does
 * that only after an explicit choice.
 */

import { MotionButton, updateExclusive } from './motionButton'
import type { PointSource } from './motionButton'
import { ButtonSet } from './buttonSet'
import { areaButtons, previewCardRect, CARD_ASPECT as LAYOUT_CARD_ASPECT } from './layout'
import type { ButtonSpec } from './layout'
import type { Seat } from '../game/halves'

export type CardAction = 'save' | 'toggle' | 'close'
export type CardKeyAction = 'open' | CardAction

/** Motion buttons of the preview ignore motion this long after opening (the wave that opened it). */
export const PREVIEW_INPUT_DELAY_MS = 800
export const STATUS_MS = 2500
/** Card aspect ratio (w / h), matches the 600 × 840 card. */
export const CARD_ASPECT = LAYOUT_CARD_ASPECT

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)))
}

/** Maps a keyboard key to a card action (pure). `open` = whether the preview is showing. */
export function cardKeyAction(key: string, open: boolean): CardKeyAction | null {
  const k = key.length === 1 ? key.toLowerCase() : key
  if (!open) return k === 'c' ? 'open' : null
  if (k === 'Escape' || k === 'c') return 'close'
  if (k === 's' || k === 'Enter') return 'save'
  if (k === 'n') return 'toggle'
  return null
}

export type { ButtonSpec }

export interface PreviewLayout {
  card: { x: number; y: number; w: number; h: number }
  buttons: ButtonSpec[]
}

/**
 * Pure layout of the preview for a W × H area (the canvas in 1P, one half in 2P with its `seat`).
 * Buttons come from `layout.ts`: raised-hand columns, SAVE alone in its own column.
 */
export function previewLayout(
  W: number, H: number, noPhoto: boolean, hasPhoto: boolean, seat: Seat | null = null,
): PreviewLayout {
  return {
    card: previewCardRect(W, H, seat),
    buttons: areaButtons(seat === null ? 'preview' : 'preview2p', W, H, seat, { noPhoto, hasPhoto }),
  }
}

/** Which preview button (if any) contains the point. */
export function buttonAt(buttons: readonly ButtonSpec[], x: number, y: number): CardAction | null {
  for (const b of buttons) {
    const dx = x - b.cx, dy = y - b.cy
    if (dx * dx + dy * dy <= b.r * b.r) return b.id as CardAction
  }
  return null
}

// ─── Offer button on game over / victory ─────────────────────────────────────

let offerBtn: MotionButton | null = null

/**
 * The end-screen buttons (Retry / Menu / Play Again / offer) ignore motion until
 * this time, and until the hand has left them: the wave that opened or closed the
 * preview must not carry over to the buttons underneath (R1.4).
 */
let endButtonsLiveAt = 0
const endButtonResetters: Array<() => void> = []

export function registerEndButtonReset(fn: () => void): void { endButtonResetters.push(fn) }

/** Call when the preview opens or closes. */
export function lockEndButtons(now: number): void {
  endButtonsLiveAt = now + PREVIEW_INPUT_DELAY_MS
  offerBtn?.reset()
  for (const fn of endButtonResetters) fn()
}

export function endButtonsLive(now: number): boolean { return now >= endButtonsLiveAt }

/**
 * The persistent "EXORCIST CARD" button of the game-over / victory screen, positioned from its
 * layout spec. The screen updates it inside its exclusive group (offer, retry, menu).
 */
export function offerButton(spec: ButtonSpec): MotionButton {
  if (!offerBtn) offerBtn = new MotionButton(spec.cx, spec.cy, spec.r, spec.label)
  else { offerBtn.cx = spec.cx; offerBtn.cy = spec.cy; offerBtn.radius = spec.r; offerBtn.label = spec.label }
  return offerBtn
}

/** True when (x, y) lies on the last drawn offer button (a click / tap). */
export function offerHit(x: number, y: number): boolean {
  if (!offerBtn) return false
  const dx = x - offerBtn.cx, dy = y - offerBtn.cy
  return dx * dx + dy * dy <= offerBtn.radius * offerBtn.radius
}

// ─── Preview overlay ─────────────────────────────────────────────────────────

export class CardPreview {
  private buttons: ButtonSet
  private openedAt = 0
  private statusText = ''
  private statusAt = Number.NEGATIVE_INFINITY
  private lastLayout: PreviewLayout | null = null

  /** `source`: motion points the buttons read (two-player: the half's own points). Default: whole frame. */
  constructor(source: PointSource | null = null, private seat: Seat | null = null) {
    this.buttons = new ButtonSet(source)
  }

  open(now: number): void {
    this.openedAt = now
    this.lastLayout = null
    this.buttons.clear()
    this.statusText = ''
    this.statusAt = Number.NEGATIVE_INFINITY
  }

  setStatus(text: string, now: number): void {
    this.statusText = text
    this.statusAt = now
  }

  /** Click / tap hit test against the last drawn layout. */
  hit(x: number, y: number): CardAction | null {
    return this.lastLayout ? buttonAt(this.lastLayout.buttons, x, y) : null
  }

  /** Draws the overlay; returns the action whose motion button just filled, if any. */
  render(
    ctx: CanvasRenderingContext2D,
    now: number,
    card: CanvasImageSource,
    noPhoto: boolean,
    hasPhoto: boolean,
  ): CardAction | null {
    const { width: W, height: H } = ctx.canvas
    const L = previewLayout(W, H, noPhoto, hasPhoto, this.seat)
    this.lastLayout = L

    ctx.save()
    ctx.fillStyle = 'rgba(13,0,20,0.94)'
    ctx.fillRect(0, 0, W, H)
    ctx.shadowColor = '#ff6b1a'
    ctx.shadowBlur = 24
    ctx.drawImage(card, L.card.x, L.card.y, L.card.w, L.card.h)
    ctx.shadowBlur = 0

    const live = now - this.openedAt >= PREVIEW_INPUT_DELAY_MS
    // Until live, motion must also leave the buttons before they can fill (the opening wave lingers).
    // One action per frame: toggle / close before the destructive SAVE (R2.7).
    const btns = this.buttons.sync(L.buttons)
    const won = updateExclusive(btns, now, live)
    const triggered: CardAction | null = won >= 0 ? (L.buttons[won].id as CardAction) : null
    for (const b of btns) b.render(ctx, now)

    if (now - this.statusAt < STATUS_MS && this.statusText) {
      ctx.font = `bold ${clamp(W / 40, 16, 26)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#39ff14'
      ctx.shadowColor = '#39ff14'
      ctx.shadowBlur = 10
      ctx.textBaseline = 'top'
      ctx.fillText(this.statusText, W / 2, Math.min(H - 30, L.card.y + L.card.h + 6))
    }
    ctx.restore()
    return triggered
  }
}
