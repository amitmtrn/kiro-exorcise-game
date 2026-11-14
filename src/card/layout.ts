/**
 * Exorcist Card layout (exorcist-card R4). Pure: sizes in, rectangles and text
 * boxes out. No canvas, no DOM, so it can be property-tested.
 */

export interface Rect { x: number; y: number; w: number; h: number }

export type Align = 'left' | 'center' | 'right'

export interface TextBox {
  text: string
  /** Anchor x: left edge, centre or right edge depending on `align`. */
  x: number
  /** Vertical centre of the line. */
  y: number
  px: number
  align: Align
  maxW: number
}

export interface CardData {
  score: number
  bestCombo: number
  stage: number
  stageCount: number
  banished: number
  rank: string
  /** Two-player only: "P1" / "P2" chip on the photo. */
  playerLabel?: string
  /** Two-player only: "WINNER" / "TIE" ribbon on the photo. */
  badge?: string
}

export interface CardTexts {
  title: string
  rank: string
  rows: ReadonlyArray<{ label: string; value: string }>
  footer: string
  playerLabel?: string
  badge?: string
}

export interface CardLayout {
  frameOuter: Rect
  frameInner: Rect
  photo: Rect
  title: TextBox
  rank: TextBox
  rows: ReadonlyArray<{ label: TextBox; value: TextBox }>
  footer: TextBox
  /** Present only when the texts carry a player label / badge (two-player card). */
  playerLabel?: TextBox
  badge?: TextBox
}

export const MIN_CARD_W = 200
export const MIN_CARD_H = 280
export const DEFAULT_CARD_W = 600
export const DEFAULT_CARD_H = 840
/** Average glyph width as a fraction of the font size (Creepster and digits are narrow). */
export const CHAR_WIDTH_EM = 0.62
export const ELLIPSIS = '…'

/** Width estimate used for layout (no canvas needed). */
export function estimateWidth(text: string, px: number): number {
  return Array.from(text).length * px * CHAR_WIDTH_EM
}

/**
 * Shrinks `basePx` towards `minPx` until the text fits `maxW`, then truncates
 * with "…". The returned box always satisfies `estimateWidth(text, px) <= maxW`
 * (the text is empty when not even "…" fits).
 */
export function fitText(
  text: string,
  maxW: number,
  basePx: number,
  minPx: number,
): { text: string; px: number } {
  const lo = Math.min(minPx, basePx)
  const chars = Array.from(text)
  if (chars.length === 0 || maxW <= 0) return { text: '', px: basePx }
  const needed = chars.length * CHAR_WIDTH_EM
  let px = Math.min(basePx, maxW / needed)
  if (px >= lo) return { text, px: Math.min(basePx, px) }
  px = lo
  const maxChars = Math.floor(maxW / (px * CHAR_WIDTH_EM))
  if (maxChars >= chars.length) return { text, px }
  if (maxChars < 1) return { text: '', px }
  return { text: chars.slice(0, maxChars - 1).join('') + ELLIPSIS, px }
}

/** Source crop with the destination's aspect ratio, centred (cover-fit, never stretched). */
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return { x: 0, y: 0, w: Math.max(0, srcW), h: Math.max(0, srcH) }
  const srcAspect = srcW / srcH
  const dstAspect = dstW / dstH
  if (srcAspect > dstAspect) {
    const w = srcH * dstAspect
    return { x: (srcW - w) / 2, y: 0, w, h: srcH }
  }
  const h = srcW / dstAspect
  return { x: 0, y: (srcH - h) / 2, w: srcW, h }
}

/** Scales (w, h) down to fit within maxW × maxH, never up; integer sizes ≥ 1. */
export function scaleToFit(w: number, h: number, maxW: number, maxH = maxW): { w: number; h: number } {
  const k = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

function groupDigits(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** The strings shown on the card. */
export function buildCardTexts(d: CardData): CardTexts {
  const extra: Partial<CardTexts> = {}
  if (d.playerLabel) extra.playerLabel = d.playerLabel
  if (d.badge) extra.badge = d.badge
  return {
    ...extra,
    title: 'EXORCIST',
    rank: d.rank,
    rows: [
      { label: 'Score', value: groupDigits(d.score) },
      { label: 'Best combo', value: `x${Math.max(1, Math.floor(d.bestCombo) || 1)}` },
      { label: 'Stage reached', value: `${groupDigits(d.stage)} / ${groupDigits(d.stageCount)}` },
      { label: 'Banished', value: groupDigits(d.banished) },
    ],
    footer: 'Made on your device. Not uploaded.',
  }
}

/**
 * Lays the card out for any size ≥ MIN_CARD_W × MIN_CARD_H. Every rectangle and
 * every text extent (estimated) stays inside [0, w] × [0, h].
 */
export function layoutCard(w: number, h: number, texts: CardTexts): CardLayout {
  w = Math.max(MIN_CARD_W, w)
  h = Math.max(MIN_CARD_H, h)
  const m = 0.05 * Math.min(w, h)
  const cx = m, cy = m, cw = w - 2 * m, ch = h - 2 * m

  const frameOuter: Rect = { x: m * 0.3, y: m * 0.3, w: w - m * 0.6, h: h - m * 0.6 }
  const frameInner: Rect = { x: m * 0.65, y: m * 0.65, w: w - m * 1.3, h: h - m * 1.3 }

  // Vertical bands as fractions of the content height.
  const band = (from: number, to: number) => ({ top: cy + ch * from, height: ch * (to - from) })
  const make = (
    text: string, b: { top: number; height: number }, x: number, align: Align,
    maxW: number, basePx: number, minPx: number,
  ): TextBox => {
    const px0 = Math.min(basePx, b.height * 0.8)
    const fit = fitText(text, maxW, px0, Math.min(minPx, px0))
    return { text: fit.text, x, y: b.top + b.height / 2, px: fit.px, align, maxW }
  }

  const titleB = band(0, 0.1)
  const photoB = band(0.11, 0.54)
  const rankB = band(0.56, 0.64)
  const footB = band(0.93, 1)

  const photo: Rect = { x: cx + cw * 0.04, y: photoB.top, w: cw * 0.92, h: photoB.height }

  const pad = cw * 0.04
  const half = cw * 0.46
  const rows = texts.rows.map((r, i) => {
    const b = band(0.67 + i * 0.06, 0.73 + i * 0.06)
    return {
      label: make(r.label, b, cx + pad, 'left', half, cw * 0.065, 8),
      value: make(r.value, b, cx + cw - pad, 'right', half, cw * 0.075, 8),
    }
  })

  // Two-player chips sit inside the photo window (top-left label, top-right badge).
  const chipB = { top: photo.y + photo.h * 0.03, height: photo.h * 0.12 }
  const chipPad = photo.w * 0.04
  const chipMax = photo.w * 0.4
  const extra: Pick<CardLayout, 'playerLabel' | 'badge'> = {}
  if (texts.playerLabel) extra.playerLabel = make(texts.playerLabel, chipB, photo.x + chipPad, 'left', chipMax, cw * 0.075, 8)
  if (texts.badge) extra.badge = make(texts.badge, chipB, photo.x + photo.w - chipPad, 'right', chipMax, cw * 0.075, 8)

  return {
    ...extra,
    frameOuter,
    frameInner,
    photo,
    title: make(texts.title, titleB, cx + cw / 2, 'center', cw, cw * 0.14, 10),
    rank: make(texts.rank, rankB, cx + cw / 2, 'center', cw, cw * 0.085, 8),
    rows,
    footer: make(texts.footer, footB, cx + cw / 2, 'center', cw, cw * 0.045, 6),
  }
}

/** Horizontal extent [left, right] of a text box using the width estimate. */
export function textExtent(t: TextBox): { left: number; right: number } {
  const tw = estimateWidth(t.text, t.px)
  if (t.align === 'left') return { left: t.x, right: t.x + tw }
  if (t.align === 'right') return { left: t.x - tw, right: t.x }
  return { left: t.x - tw / 2, right: t.x + tw / 2 }
}
