/**
 * Game canvas rendering — enemies (procedural canvas shapes) and particles.
 * All visual output goes to the #game-canvas context passed in.
 */

import type { GameState, Enemy, Particle } from './state'

// ─── Colours ──────────────────────────────────────────────────────────────────
const COLOR_GHOST_BODY = '#e8e8f0'
const COLOR_GHOST_EYE = '#1a0030'
const COLOR_BAT_BODY = '#2a0845'
const COLOR_BAT_WING = '#1a0030'
const COLOR_SKULL_FACE = '#ff6b1a'
const COLOR_SKULL_EYE = '#c0392b'

// ─── Main entry point ─────────────────────────────────────────────────────────

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  // Draw enemies
  for (const enemy of state.enemies) {
    drawEnemy(ctx, enemy, now)
  }

  // Draw particles
  for (const p of state.particles) {
    drawParticle(ctx, p)
  }

  // Red flash overlay (skull hit)
  if (now < state.flashEndTime) {
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#c0392b'
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.restore()
  }
}

// ─── Enemy dispatch ───────────────────────────────────────────────────────────

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number): void {
  ctx.save()
  ctx.translate(enemy.x, enemy.y)

  switch (enemy.type) {
    case 'ghost': drawGhost(ctx); break
    case 'bat':   drawBat(ctx); break
    case 'skull': drawSkull(ctx, now); break
  }

  ctx.restore()
}

// ─── Ghost ────────────────────────────────────────────────────────────────────

function drawGhost(ctx: CanvasRenderingContext2D): void {
  const w = 40   // half-width
  const h = 50   // half-height

  ctx.shadowColor = 'rgba(232, 232, 240, 0.7)'
  ctx.shadowBlur = 16

  // Body — ellipse upper half + wavy bottom
  ctx.fillStyle = COLOR_GHOST_BODY
  ctx.beginPath()
  // Top arc
  ctx.arc(0, -h * 0.2, w, Math.PI, 0, false)
  // Right side down
  ctx.lineTo(w, h * 0.6)
  // Wavy bottom (3 bumps)
  const bumpW = (w * 2) / 3
  ctx.quadraticCurveTo(w - bumpW * 0.5, h * 0.9, w - bumpW, h * 0.6)
  ctx.quadraticCurveTo(w - bumpW * 1.5, h * 0.9, w - bumpW * 2, h * 0.6)
  ctx.quadraticCurveTo(-w + bumpW * 0.5, h * 0.9, -w, h * 0.6)
  ctx.closePath()
  ctx.fill()

  // Eyes
  ctx.shadowBlur = 0
  ctx.fillStyle = COLOR_GHOST_EYE
  ctx.beginPath()
  ctx.ellipse(-14, -h * 0.05, 7, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(14, -h * 0.05, 7, 9, 0, 0, Math.PI * 2)
  ctx.fill()
}

// ─── Bat ──────────────────────────────────────────────────────────────────────

function drawBat(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'rgba(42, 8, 69, 0.8)'
  ctx.shadowBlur = 10

  // Wings
  ctx.fillStyle = COLOR_BAT_WING
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-10, -12, -28, -16, -40, -4)
  ctx.bezierCurveTo(-28, 4, -10, 8, 0, 0)
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(10, -12, 28, -16, 40, -4)
  ctx.bezierCurveTo(28, 4, 10, 8, 0, 0)
  ctx.fill()

  // Body
  ctx.fillStyle = COLOR_BAT_BODY
  ctx.beginPath()
  ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2)
  ctx.fill()

  // Eyes
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffd166'
  ctx.beginPath()
  ctx.arc(-4, -3, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(4, -3, 2.5, 0, Math.PI * 2)
  ctx.fill()
}

// ─── Skull ────────────────────────────────────────────────────────────────────

function drawSkull(ctx: CanvasRenderingContext2D, now: number): void {
  // Pulsing glow 10–20 px
  const glow = 10 + Math.sin(now / 300) * 5
  ctx.shadowColor = '#c0392b'
  ctx.shadowBlur = glow

  const r = 22

  // Head
  ctx.fillStyle = COLOR_SKULL_FACE
  ctx.beginPath()
  ctx.arc(0, -4, r, 0, Math.PI * 2)
  ctx.fill()

  // Jaw
  ctx.fillStyle = COLOR_SKULL_FACE
  ctx.beginPath()
  ctx.roundRect(-14, 10, 28, 16, 5)
  ctx.fill()

  // Eyes
  ctx.shadowBlur = 0
  ctx.fillStyle = COLOR_SKULL_EYE
  ctx.beginPath()
  ctx.ellipse(-9, -6, 6, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(9, -6, 6, 8, 0, 0, Math.PI * 2)
  ctx.fill()

  // Nasal cavity
  ctx.beginPath()
  ctx.ellipse(0, 4, 3.5, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Crack
  ctx.strokeStyle = '#8b0000'
  ctx.lineWidth = 1.5
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.moveTo(-4, -20)
  ctx.lineTo(-2, -12)
  ctx.lineTo(-6, -6)
  ctx.stroke()
}

// ─── Particle ────────────────────────────────────────────────────────────────

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save()
  ctx.globalAlpha = Math.max(0, p.alpha)
  ctx.fillStyle = p.color
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
