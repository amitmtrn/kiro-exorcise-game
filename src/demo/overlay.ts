/**
 * Demo mode art (demo-mode R2.4, R6.1–R6.3): backdrop, ghost-hand cursor, DEMO badge and
 * the placeholder portrait for the Exorcist Card. Procedural canvas only: no images, no fetch.
 */

import type { Pt } from './camera'
import { TITLE_FONT_FAMILY } from '../ui/fonts'

const COLORS = {
  midnight: '#0d0014',
  purple: '#2a0845',
  orange: '#ff6b1a',
  yellow: '#ffd166',
  ghost: '#e8e8f0',
}

/** Head-and-shoulders silhouette of the placeholder "player", centred at `cx`, feet at the bottom of `h`. */
export function drawDemoPlayer(ctx: CanvasRenderingContext2D, cx: number, w: number, h: number, alpha = 1): void {
  const s = Math.min(w, h * 1.2)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#07000c'
  ctx.beginPath() // shoulders
  ctx.ellipse(cx, h + s * 0.12, s * 0.38, s * 0.42, 0, Math.PI, 0)
  ctx.fill()
  ctx.beginPath() // neck
  ctx.rect(cx - s * 0.05, h - s * 0.5, s * 0.1, s * 0.12)
  ctx.fill()
  ctx.beginPath() // head
  ctx.ellipse(cx, h - s * 0.62, s * 0.14, s * 0.17, 0, 0, Math.PI * 2)
  ctx.fill()
  // A pale rim light so the silhouette reads against the dark scene.
  ctx.strokeStyle = 'rgba(232,232,240,0.35)'
  ctx.lineWidth = Math.max(2, s * 0.008)
  ctx.beginPath()
  ctx.ellipse(cx, h - s * 0.62, s * 0.14, s * 0.17, 0, Math.PI * 1.1, Math.PI * 1.9)
  ctx.stroke()
  ctx.restore()
}

/** The webcam layer in demo mode: dark graveyard scene with moon, stones, dead trees and the placeholder player. */
export function drawDemoBackdrop(ctx: CanvasRenderingContext2D): void {
  const { width: W, height: H } = ctx.canvas
  ctx.save()
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, COLORS.midnight)
  g.addColorStop(0.7, COLORS.purple)
  g.addColorStop(1, '#14031f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Moon behind a cloud band
  ctx.fillStyle = 'rgba(232,232,240,0.85)'
  ctx.beginPath(); ctx.arc(W * 0.8, H * 0.2, Math.min(W, H) * 0.07, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(42,8,69,0.7)'
  ctx.beginPath(); ctx.ellipse(W * 0.78, H * 0.22, W * 0.12, H * 0.025, 0, 0, Math.PI * 2); ctx.fill()

  // Gravestones along the bottom
  ctx.fillStyle = '#0a0210'
  for (let i = 0; i < 9; i++) {
    const x = ((i + 0.5) / 9) * W
    const gw = W * 0.045, gh = H * (0.09 + 0.04 * ((i * 5) % 3))
    ctx.beginPath()
    ctx.moveTo(x - gw / 2, H)
    ctx.lineTo(x - gw / 2, H - gh)
    ctx.quadraticCurveTo(x, H - gh - gw * 0.7, x + gw / 2, H - gh)
    ctx.lineTo(x + gw / 2, H)
    ctx.closePath(); ctx.fill()
  }
  // Dead trees at the edges
  ctx.strokeStyle = '#0a0210'
  ctx.lineWidth = Math.max(3, W * 0.006)
  for (const [x, dir] of [[W * 0.06, 1], [W * 0.94, -1]] as const) {
    ctx.beginPath()
    ctx.moveTo(x, H)
    ctx.lineTo(x, H * 0.55)
    ctx.moveTo(x, H * 0.7); ctx.lineTo(x + dir * W * 0.05, H * 0.58)
    ctx.moveTo(x, H * 0.62); ctx.lineTo(x - dir * W * 0.035, H * 0.5)
    ctx.stroke()
  }
  drawDemoPlayer(ctx, W / 2, W, H, 0.55)
  ctx.restore()
}

/**
 * The translucent ghost hand (R6.2): a fading trail, a soft glow and a palm with four fingers
 * and a thumb, in ghost-white. `r` is the radius of the hand disc the camera draws, so the cursor
 * covers exactly the area the game sees as motion.
 */
export function drawGhostHand(ctx: CanvasRenderingContext2D, hand: Pt, trail: readonly Pt[], r: number, now: number): void {
  ctx.save()
  trail.forEach((p, i) => {
    const k = (i + 1) / (trail.length + 1)
    ctx.globalAlpha = 0.18 * k
    ctx.fillStyle = COLORS.ghost
    ctx.beginPath(); ctx.arc(p.x, p.y, r * (0.5 + 0.4 * k), 0, Math.PI * 2); ctx.fill()
  })
  const pulse = 0.5 + 0.5 * Math.sin(now / 180)
  ctx.globalAlpha = 1
  ctx.shadowColor = COLORS.ghost
  ctx.shadowBlur = 14 + 8 * pulse
  ctx.fillStyle = 'rgba(232,232,240,0.30)'
  ctx.strokeStyle = 'rgba(232,232,240,0.75)'
  ctx.lineWidth = 2
  // palm
  ctx.beginPath(); ctx.ellipse(hand.x, hand.y + r * 0.12, r * 0.55, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // fingers
  for (let i = 0; i < 4; i++) {
    const fx = hand.x + (i - 1.5) * r * 0.28
    const len = r * (0.62 + (i === 1 || i === 2 ? 0.12 : 0))
    ctx.beginPath()
    ctx.ellipse(fx, hand.y - r * 0.3 - len * 0.35, r * 0.12, len * 0.5, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }
  // thumb
  ctx.beginPath()
  ctx.ellipse(hand.x - r * 0.62, hand.y + r * 0.02, r * 0.11, r * 0.34, -0.9, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.restore()
}

/** The persistent label (R6.1): a "DEMO" pill at the bottom centre with a short caption. Drawn last, every tick. */
export function drawDemoBadge(ctx: CanvasRenderingContext2D): void {
  const { width: W, height: H } = ctx.canvas
  const px = Math.max(18, Math.min(34, Math.round(W / 38)))
  const pillW = px * 4.4, pillH = px * 1.7
  const x = W / 2 - pillW / 2
  const y = H - pillH - Math.max(10, H * 0.02) - px * 1.1
  ctx.save()
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(13,0,20,0.8)'
  ctx.strokeStyle = COLORS.orange
  ctx.lineWidth = 3
  const rad = pillH / 2
  ctx.beginPath() // pill: two half circles joined by straight edges
  ctx.arc(x + rad, y + rad, rad, Math.PI / 2, Math.PI * 1.5)
  ctx.arc(x + pillW - rad, y + rad, rad, -Math.PI / 2, Math.PI / 2)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${px}px ${TITLE_FONT_FAMILY}`
  ctx.fillStyle = COLORS.orange
  ctx.shadowColor = COLORS.orange
  ctx.shadowBlur = 10
  ctx.fillText('DEMO', W / 2, y + pillH / 2, pillW * 0.85)
  ctx.shadowBlur = 0
  ctx.font = `${Math.round(px * 0.55)}px sans-serif`
  ctx.fillStyle = 'rgba(232,232,240,0.85)'
  ctx.fillText('scripted ghost hand · no camera · press any key to play', W / 2, y + pillH + px * 0.7, W * 0.9)
  ctx.restore()
}

/**
 * Placeholder portrait for the Exorcist Card (R6.3): the silhouette on the dark scene, drawn into a
 * new canvas of `w` × `h`. Stands in for the camera snapshot, which does not exist in demo mode.
 */
export function drawDemoPortrait(w: number, h: number, create: () => HTMLCanvasElement = () => document.createElement('canvas')): HTMLCanvasElement {
  const canvas = create()
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    drawDemoBackdrop(ctx)
    drawDemoPlayer(ctx, w / 2, w, h, 0.9)
  }
  return canvas
}
