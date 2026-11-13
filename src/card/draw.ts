/**
 * Exorcist Card drawing (exorcist-card R3). Procedural canvas art only; all
 * positions come from the pure `layoutCard`.
 */

import { TITLE_FONT_FAMILY } from '../ui/fonts'
import { buildCardTexts, coverRect, layoutCard } from './layout'
import type { CardData, Rect, TextBox } from './layout'

/** A snapshot to paint: any canvas-like image source with its pixel size. */
export interface CardPhoto {
  source: CanvasImageSource
  width: number
  height: number
}

const COLORS = {
  midnight: '#0d0014',
  purple: '#2a0845',
  orange: '#ff6b1a',
  yellow: '#ffd166',
  ghost: '#e8e8f0',
  green: '#39ff14',
}

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.min(radius, r.w / 2, r.h / 2)
  ctx.beginPath()
  ctx.moveTo(r.x + rad, r.y)
  ctx.lineTo(r.x + r.w - rad, r.y)
  ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + rad)
  ctx.lineTo(r.x + r.w, r.y + r.h - rad)
  ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h)
  ctx.lineTo(r.x + rad, r.y + r.h)
  ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - rad)
  ctx.lineTo(r.x, r.y + rad)
  ctx.quadraticCurveTo(r.x, r.y, r.x + rad, r.y)
  ctx.closePath()
}

function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.7, x - s, y - s * 0.2)
  ctx.quadraticCurveTo(x - s * 0.7, y + s * 0.1, x - s * 0.5, y + s * 0.3)
  ctx.quadraticCurveTo(x - s * 0.25, y + s * 0.1, x, y + s * 0.35)
  ctx.quadraticCurveTo(x + s * 0.25, y + s * 0.1, x + s * 0.5, y + s * 0.3)
  ctx.quadraticCurveTo(x + s * 0.7, y + s * 0.1, x + s, y - s * 0.2)
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.7, x, y)
  ctx.closePath()
  ctx.fill()
}

function drawCobweb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dx: number, dy: number): void {
  ctx.beginPath()
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2)
    ctx.moveTo(x, y)
    ctx.lineTo(x + dx * Math.cos(a) * r, y + dy * Math.sin(a) * r)
  }
  for (let k = 1; k <= 3; k++) {
    const rr = (r * k) / 3
    ctx.moveTo(x + dx * rr, y)
    ctx.quadraticCurveTo(x + dx * rr * 0.55, y + dy * rr * 0.55, x, y + dy * rr)
  }
  ctx.stroke()
}

function drawText(ctx: CanvasRenderingContext2D, t: TextBox, font: string): void {
  if (!t.text) return
  ctx.font = `${Math.round(t.px)}px ${font}`
  ctx.textAlign = t.align
  ctx.textBaseline = 'middle'
  // maxWidth squeezes the text if the real font is wider than the layout estimate.
  ctx.fillText(t.text, t.x, t.y, t.maxW)
}

/** Head-and-shoulders silhouette for the "no photo" variant. */
export function drawSilhouette(ctx: CanvasRenderingContext2D, r: Rect): void {
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h)
  g.addColorStop(0, '#3b0f63')
  g.addColorStop(1, COLORS.midnight)
  ctx.fillStyle = g
  ctx.fillRect(r.x, r.y, r.w, r.h)
  const cx = r.x + r.w / 2
  const unit = Math.min(r.w, r.h)
  ctx.fillStyle = '#12001f'
  ctx.beginPath()
  ctx.arc(cx, r.y + r.h * 0.42, unit * 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx, r.y + r.h + unit * 0.02, unit * 0.42, unit * 0.34, 0, Math.PI, 0)
  ctx.fill()
}

/**
 * Paints the whole card onto `ctx` (size w × h). `photo === null` draws the
 * silhouette variant. The snapshot is expected to be mirrored already (it is
 * captured with the same mirrored draw as the live view).
 */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: CardData,
  photo: CardPhoto | null,
): void {
  const L = layoutCard(w, h, buildCardTexts(data))
  ctx.save()

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, COLORS.midnight)
  bg.addColorStop(1, COLORS.purple)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Moon + stars
  ctx.fillStyle = 'rgba(255,209,102,0.9)'
  ctx.beginPath(); ctx.arc(w * 0.92, h * 0.06, w * 0.03, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(232,232,240,0.7)'
  for (let i = 0; i < 12; i++) {
    const sx = L.frameInner.x + ((i * 53) % 100) / 100 * L.frameInner.w
    const sy = L.frameInner.y + ((i * 37) % 100) / 100 * L.frameInner.h
    ctx.fillRect(sx, sy, 2, 2)
  }

  // Photo or silhouette, cover-fitted and clipped to a rounded rect
  ctx.save()
  roundRectPath(ctx, L.photo, w * 0.03)
  ctx.clip()
  if (photo && photo.width > 0 && photo.height > 0) {
    const src = coverRect(photo.width, photo.height, L.photo.w, L.photo.h)
    ctx.drawImage(photo.source, src.x, src.y, src.w, src.h, L.photo.x, L.photo.y, L.photo.w, L.photo.h)
    // soft purple vignette so the photo blends into the card
    const v = ctx.createLinearGradient(0, L.photo.y, 0, L.photo.y + L.photo.h)
    v.addColorStop(0, 'rgba(42,8,69,0.25)')
    v.addColorStop(1, 'rgba(13,0,20,0.45)')
    ctx.fillStyle = v
    ctx.fillRect(L.photo.x, L.photo.y, L.photo.w, L.photo.h)
  } else {
    drawSilhouette(ctx, L.photo)
  }
  ctx.restore()
  ctx.strokeStyle = COLORS.yellow
  ctx.lineWidth = Math.max(2, w * 0.004)
  roundRectPath(ctx, L.photo, w * 0.03)
  ctx.stroke()

  // Frames
  ctx.strokeStyle = COLORS.orange
  ctx.lineWidth = Math.max(3, w * 0.008)
  ctx.shadowColor = COLORS.orange
  ctx.shadowBlur = w * 0.02
  roundRectPath(ctx, L.frameOuter, w * 0.05)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = COLORS.yellow
  ctx.lineWidth = Math.max(1.5, w * 0.003)
  roundRectPath(ctx, L.frameInner, w * 0.04)
  ctx.stroke()

  // Cobwebs in the corners, bats on the title band
  ctx.strokeStyle = 'rgba(232,232,240,0.35)'
  ctx.lineWidth = 1
  const cw = w * 0.1
  drawCobweb(ctx, L.frameInner.x, L.frameInner.y, cw, 1, 1)
  drawCobweb(ctx, L.frameInner.x + L.frameInner.w, L.frameInner.y, cw, -1, 1)
  ctx.fillStyle = COLORS.ghost
  const bs = w * 0.035
  drawBat(ctx, L.title.x - w * 0.34, L.title.y, bs)
  drawBat(ctx, L.title.x + w * 0.34, L.title.y, bs)

  // Title
  ctx.fillStyle = COLORS.orange
  ctx.shadowColor = COLORS.orange
  ctx.shadowBlur = w * 0.025
  drawText(ctx, L.title, TITLE_FONT_FAMILY)
  ctx.shadowBlur = 0

  // Rank
  ctx.fillStyle = COLORS.ghost
  drawText(ctx, L.rank, TITLE_FONT_FAMILY)

  // Stat rows (combo in slime green, the rest candlelight)
  L.rows.forEach((row, i) => {
    ctx.fillStyle = 'rgba(232,232,240,0.75)'
    drawText(ctx, row.label, 'sans-serif')
    ctx.fillStyle = i === 1 ? COLORS.green : COLORS.yellow
    drawText(ctx, { ...row.value, px: row.value.px }, 'sans-serif')
  })

  // Footer
  ctx.fillStyle = 'rgba(232,232,240,0.55)'
  drawText(ctx, L.footer, 'sans-serif')

  ctx.restore()
}

/** Creates a card canvas and paints it. Only call after the player chose the card. */
export function composeCard(
  data: CardData,
  photo: CardPhoto | null,
  w = 600,
  h = 840,
  create: () => HTMLCanvasElement = () => document.createElement('canvas'),
): HTMLCanvasElement {
  const canvas = create()
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) drawCard(ctx, w, h, data, photo)
  return canvas
}
