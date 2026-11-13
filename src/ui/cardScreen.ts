/**
 * Exorcist Card UI (exorcist-card R1): the "EXORCIST CARD" offer button on the
 * game-over / victory screens and the preview overlay with SAVE / NO PHOTO /
 * CLOSE. Nothing here composes or downloads anything by itself: the loop does
 * that only after an explicit choice.
 */

import { MotionButton } from './motionButton'

export type CardAction = 'save' | 'toggle' | 'close'
export type CardKeyAction = 'open' | CardAction

/** Motion buttons of the preview ignore motion this long after opening (the wave that opened it). */
export const PREVIEW_INPUT_DELAY_MS = 800
export const STATUS_MS = 2500
/** Card aspect ratio (w / h), matches the 600 × 840 card. */
export const CARD_ASPECT = 600 / 840

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

export interface ButtonSpec { id: CardAction; cx: number; cy: number; r: number; label: string }

export interface PreviewLayout {
  card: { x: number; y: number; w: number; h: number }
  buttons: ButtonSpec[]
}

/** Pure layout of the preview for a W × H canvas. */
export function previewLayout(W: number, H: number, noPhoto: boolean, hasPhoto: boolean): PreviewLayout {
  const maxH = H * 0.72
  const ch = Math.min(maxH, (W * 0.9) / CARD_ASPECT)
  const cw = ch * CARD_ASPECT
  const card = { x: (W - cw) / 2, y: H * 0.03, w: cw, h: ch }
  const r = clamp(Math.min(W / 12, H * 0.075), 36, 64)
  const cy = Math.min(H - r - 8, card.y + card.h + r + 14)
  const specs: Array<Pick<ButtonSpec, 'id' | 'label'>> = [{ id: 'save', label: '💾\nSAVE' }]
  if (hasPhoto) specs.push({ id: 'toggle', label: noPhoto ? '📷\nPHOTO' : '👻 NO\nPHOTO' })
  specs.push({ id: 'close', label: '✖\nCLOSE' })
  const step = Math.min(W / (specs.length + 1), r * 2.8)
  const x0 = W / 2 - (step * (specs.length - 1)) / 2
  return { card, buttons: specs.map((s, i) => ({ ...s, cx: x0 + i * step, cy, r })) }
}

/** Which preview button (if any) contains the point. */
export function buttonAt(buttons: readonly ButtonSpec[], x: number, y: number): CardAction | null {
  for (const b of buttons) {
    const dx = x - b.cx, dy = y - b.cy
    if (dx * dx + dy * dy <= b.r * b.r) return b.id
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

export function offerGeometry(W: number, H: number, baseY: number, mainR: number) {
  const r = clamp(Math.min(W / 14, H * 0.065), 36, 52)
  const cy = Math.min(baseY + mainR + r + 10, H - r - 6)
  return { cx: W / 2, cy, r }
}

/**
 * Draws the "EXORCIST CARD" button under the main buttons. Returns true when
 * the motion fill completed. `live === false` draws it without reading motion.
 */
export function renderCardOffer(
  ctx: CanvasRenderingContext2D,
  now: number,
  baseY: number,
  mainR: number,
  live = true,
): boolean {
  const { width: W, height: H } = ctx.canvas
  const g = offerGeometry(W, H, baseY, mainR)
  if (!offerBtn) offerBtn = new MotionButton(g.cx, g.cy, g.r, '📸 EXORCIST\nCARD')
  else { offerBtn.cx = g.cx; offerBtn.cy = g.cy; offerBtn.radius = g.r }
  const res = offerBtn.updateGated(now, live && endButtonsLive(now))
  offerBtn.render(ctx, now)
  return res === 'triggered'
}

/** True when (x, y) lies on the last drawn offer button (a click / tap). */
export function offerHit(x: number, y: number): boolean {
  if (!offerBtn) return false
  const dx = x - offerBtn.cx, dy = y - offerBtn.cy
  return dx * dx + dy * dy <= offerBtn.radius * offerBtn.radius
}

// ─── Preview overlay ─────────────────────────────────────────────────────────

export class CardPreview {
  private buttons = new Map<CardAction, MotionButton>()
  private openedAt = 0
  private statusText = ''
  private statusAt = Number.NEGATIVE_INFINITY
  private lastLayout: PreviewLayout | null = null

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
    const L = previewLayout(W, H, noPhoto, hasPhoto)
    this.lastLayout = L

    ctx.save()
    ctx.fillStyle = 'rgba(13,0,20,0.94)'
    ctx.fillRect(0, 0, W, H)
    ctx.shadowColor = '#ff6b1a'
    ctx.shadowBlur = 24
    ctx.drawImage(card, L.card.x, L.card.y, L.card.w, L.card.h)
    ctx.shadowBlur = 0

    const live = now - this.openedAt >= PREVIEW_INPUT_DELAY_MS
    let triggered: CardAction | null = null
    for (const spec of L.buttons) {
      let btn = this.buttons.get(spec.id)
      if (!btn) { btn = new MotionButton(spec.cx, spec.cy, spec.r, spec.label); this.buttons.set(spec.id, btn) }
      btn.cx = spec.cx; btn.cy = spec.cy; btn.radius = spec.r; btn.label = spec.label
      // Until live, motion must also leave the button before it can fill (the opening wave lingers).
      if (btn.updateGated(now, live) === 'triggered' && !triggered) triggered = spec.id
      btn.render(ctx, now)
    }

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
