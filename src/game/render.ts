/**
 * Game canvas rendering — fog + candle glow, enemies (procedural canvas
 * shapes), particles, boss health bar, red flash, and optional debug overlay.
 */

import type { GameState, Enemy, Particle } from './state'
import { lastMotionPixels } from './collision'
import { BOSS_HITS_NEEDED } from './enemies/boss'
import { drawFog, drawCandleGlow } from './atmosphere'

// ─── Debug mode ───────────────────────────────────────────────────────────────
let debugMode = false
export function toggleDebug(): void { debugMode = !debugMode }

// ─── Colours ──────────────────────────────────────────────────────────────────
const C_GHOST   = '#e8e8f0'
const C_EYE     = '#1a0030'
const C_BAT_B   = '#2a0845'
const C_BAT_W   = '#1a0030'
const C_SKULL   = '#ff6b1a'
const C_SKULL_E = '#c0392b'
const C_LUNGER  = '#9b59b6'
const C_PUMPKIN = '#ff6b1a'
const C_BOSS    = '#e8e8f0'

// ─── Main entry ───────────────────────────────────────────────────────────────

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  // Atmosphere sits behind everything (spooky-skin R2)
  drawFog(ctx, now)
  drawCandleGlow(ctx, now)

  for (const enemy of state.enemies) drawEnemy(ctx, enemy, now)
  for (const p of state.particles) drawParticle(ctx, p)

  // Boss health bar
  const boss = state.enemies.find(e => e.type === 'boss')
  if (boss) drawBossHealthBar(ctx, boss)

  // Red/orange flash overlay
  if (now < state.flashEndTime) {
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#c0392b'
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.restore()
  }

  if (debugMode) drawDebugOverlay(ctx, state, now)
}

// ─── Enemy dispatch ───────────────────────────────────────────────────────────

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number): void {
  ctx.save()
  ctx.translate(enemy.x, enemy.y)
  switch (enemy.type) {
    case 'ghost':   drawGhost(ctx); break
    case 'bat':     drawBat(ctx); break
    case 'skull':   drawSkull(ctx, now); break
    case 'lunger':  drawLunger(ctx, enemy, now); break
    case 'pumpkin': drawPumpkin(ctx, enemy); break
    case 'boss':    drawBoss(ctx, now); break
  }
  ctx.restore()
}

// ─── Ghost ────────────────────────────────────────────────────────────────────
function drawGhost(ctx: CanvasRenderingContext2D): void {
  const w = 40, h = 50
  ctx.shadowColor = 'rgba(232,232,240,0.7)'; ctx.shadowBlur = 16
  ctx.fillStyle = C_GHOST
  ctx.beginPath()
  ctx.arc(0, -h * 0.2, w, Math.PI, 0, false)
  ctx.lineTo(w, h * 0.6)
  const bw = (w * 2) / 3
  ctx.quadraticCurveTo(w - bw * 0.5, h * 0.9, w - bw, h * 0.6)
  ctx.quadraticCurveTo(w - bw * 1.5, h * 0.9, w - bw * 2, h * 0.6)
  ctx.quadraticCurveTo(-w + bw * 0.5, h * 0.9, -w, h * 0.6)
  ctx.closePath(); ctx.fill()
  ctx.shadowBlur = 0; ctx.fillStyle = C_EYE
  ctx.beginPath(); ctx.ellipse(-14, -h * 0.05, 7, 9, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(14, -h * 0.05, 7, 9, 0, 0, Math.PI * 2); ctx.fill()
}

// ─── Bat ──────────────────────────────────────────────────────────────────────
function drawBat(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'rgba(42,8,69,0.8)'; ctx.shadowBlur = 10
  ctx.fillStyle = C_BAT_W
  ctx.beginPath(); ctx.moveTo(0,0)
  ctx.bezierCurveTo(-10,-12,-28,-16,-40,-4); ctx.bezierCurveTo(-28,4,-10,8,0,0); ctx.fill()
  ctx.beginPath(); ctx.moveTo(0,0)
  ctx.bezierCurveTo(10,-12,28,-16,40,-4); ctx.bezierCurveTo(28,4,10,8,0,0); ctx.fill()
  ctx.fillStyle = C_BAT_B
  ctx.beginPath(); ctx.ellipse(0,0,8,10,0,0,Math.PI*2); ctx.fill()
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffd166'
  ctx.beginPath(); ctx.arc(-4,-3,2.5,0,Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.arc(4,-3,2.5,0,Math.PI*2); ctx.fill()
}

// ─── Skull ────────────────────────────────────────────────────────────────────
function drawSkull(ctx: CanvasRenderingContext2D, now: number): void {
  const glow = 10 + Math.sin(now / 300) * 5
  ctx.shadowColor = '#c0392b'; ctx.shadowBlur = glow
  ctx.fillStyle = C_SKULL
  ctx.beginPath(); ctx.arc(0,-4,22,0,Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.roundRect(-14,10,28,16,5); ctx.fill()
  ctx.shadowBlur = 0; ctx.fillStyle = C_SKULL_E
  ctx.beginPath(); ctx.ellipse(-9,-6,6,8,0,0,Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(9,-6,6,8,0,0,Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(0,4,3.5,4,0,0,Math.PI*2); ctx.fill()
  ctx.strokeStyle = '#8b0000'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(-4,-20); ctx.lineTo(-2,-12); ctx.lineTo(-6,-6); ctx.stroke()
}

// ─── Lunger ───────────────────────────────────────────────────────────────────
function drawLunger(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number): void {
  const isWindup = enemy.movePhase === 'windup'
  // Scale up slightly during windup to telegraph the lunge
  const scale = isWindup ? 1 + 0.3 * Math.sin(now / 60) : 1
  ctx.scale(scale, scale)
  ctx.shadowColor = C_LUNGER; ctx.shadowBlur = isWindup ? 20 : 10
  // Purple ghost variant
  ctx.fillStyle = C_LUNGER
  ctx.beginPath()
  ctx.arc(0, -20, 36, Math.PI, 0, false)
  ctx.lineTo(36, 28)
  const bw = 24
  ctx.quadraticCurveTo(36 - bw * 0.5, 45, 36 - bw, 28)
  ctx.quadraticCurveTo(36 - bw * 1.5, 45, 36 - bw * 2, 28)
  ctx.quadraticCurveTo(-36 + bw * 0.5, 45, -36, 28)
  ctx.closePath(); ctx.fill()
  ctx.shadowBlur = 0; ctx.fillStyle = '#1a0030'
  ctx.beginPath(); ctx.ellipse(-12, -8, 6, 8, 0, 0, Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(12, -8, 6, 8, 0, 0, Math.PI*2); ctx.fill()
}

// ─── Pumpkin ──────────────────────────────────────────────────────────────────
function drawPumpkin(ctx: CanvasRenderingContext2D, enemy: Enemy): void {
  const damaged = enemy.hitsReceived > 0
  const s = damaged ? 0.85 : 1
  ctx.scale(s, s)
  ctx.shadowColor = C_PUMPKIN; ctx.shadowBlur = damaged ? 20 : 8
  // Body: 3 stacked ellipses
  ctx.fillStyle = C_PUMPKIN
  ctx.beginPath(); ctx.ellipse(0, 0, 28, 30, 0, 0, Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(-16, 2, 16, 28, -0.2, 0, Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(16, 2, 16, 28, 0.2, 0, Math.PI*2); ctx.fill()
  // Stem
  ctx.fillStyle = '#4a7c2f'
  ctx.fillRect(-3, -32, 6, 10)
  // Face
  ctx.shadowBlur = 0; ctx.fillStyle = '#1a0030'
  ctx.beginPath(); ctx.moveTo(-14,-6); ctx.lineTo(-8,-12); ctx.lineTo(-2,-6); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(2,-6); ctx.lineTo(8,-12); ctx.lineTo(14,-6); ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-12,8); ctx.lineTo(-8,14); ctx.lineTo(-4,10);
  ctx.lineTo(0,14); ctx.lineTo(4,10); ctx.lineTo(8,14); ctx.lineTo(12,8)
  ctx.stroke()
}

// ─── Boss ─────────────────────────────────────────────────────────────────────
function drawBoss(ctx: CanvasRenderingContext2D, now: number): void {
  const glow = 14 + Math.sin(now / 400) * 6
  ctx.shadowColor = '#7b2fbe'; ctx.shadowBlur = glow
  // Enlarged ghost
  const w = 80, h = 100
  ctx.fillStyle = C_BOSS
  ctx.beginPath()
  ctx.arc(0, -h * 0.2, w, Math.PI, 0, false)
  ctx.lineTo(w, h * 0.6)
  const bw = (w * 2) / 3
  ctx.quadraticCurveTo(w - bw * 0.5, h * 0.9, w - bw, h * 0.6)
  ctx.quadraticCurveTo(w - bw * 1.5, h * 0.9, w - bw * 2, h * 0.6)
  ctx.quadraticCurveTo(-w + bw * 0.5, h * 0.9, -w, h * 0.6)
  ctx.closePath(); ctx.fill()
  // Witch hat
  ctx.shadowBlur = 0; ctx.fillStyle = '#1a0030'
  ctx.beginPath(); ctx.moveTo(-50, -h*0.1); ctx.lineTo(50, -h*0.1)
  ctx.lineTo(35, -h*0.5); ctx.lineTo(-35, -h*0.5); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-50,-h*0.1); ctx.lineTo(50,-h*0.1)
  ctx.lineTo(40,-h*0.2); ctx.lineTo(-40,-h*0.2); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#ff6b1a'
  ctx.fillRect(-16, -h*0.38, 32, 7)
  // Eyes
  ctx.fillStyle = C_EYE
  ctx.beginPath(); ctx.ellipse(-28, -h*0.05, 14, 18, 0, 0, Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(28, -h*0.05, 14, 18, 0, 0, Math.PI*2); ctx.fill()
}

// ─── Boss health bar ─────────────────────────────────────────────────────────
function drawBossHealthBar(ctx: CanvasRenderingContext2D, boss: Enemy): void {
  const { width: W, height: H } = ctx.canvas
  const barW = Math.min(400, W * 0.6)
  const barH = 16
  const x = (W - barW) / 2
  const y = H - 48

  const remaining = boss.hitsNeeded - boss.bossHitsReceived
  const ratio = remaining / BOSS_HITS_NEEDED

  ctx.save()
  ctx.shadowBlur = 0
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4)
  // Fill
  const grad = ctx.createLinearGradient(x, y, x + barW, y)
  grad.addColorStop(0, '#7b2fbe')
  grad.addColorStop(1, '#e8e8f0')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, barW * ratio, barH)
  // Label
  ctx.fillStyle = '#e8e8f0'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`👻 BOSS  ${remaining} / ${BOSS_HITS_NEEDED}`, W / 2, y - 6)
  ctx.textAlign = 'left'
  ctx.restore()
}

// ─── Particle ─────────────────────────────────────────────────────────────────
function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save()
  ctx.globalAlpha = Math.max(0, p.alpha)
  ctx.fillStyle = p.color
  ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill()
  ctx.restore()
}

// ─── Debug overlay ────────────────────────────────────────────────────────────
function drawDebugOverlay(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  ctx.save()
  for (const enemy of state.enemies) {
    const inGrace = now - enemy.spawnedAt < 300
    ctx.strokeStyle = inGrace ? 'rgba(255,220,0,0.9)' : 'rgba(0,255,0,0.9)'
    ctx.fillStyle   = inGrace ? 'rgba(255,220,0,0.15)' : 'rgba(0,255,0,0.15)'
    ctx.lineWidth = 2; ctx.shadowBlur = 0
    ctx.fillRect(enemy.hitbox.x, enemy.hitbox.y, enemy.hitbox.w, enemy.hitbox.h)
    ctx.strokeRect(enemy.hitbox.x, enemy.hitbox.y, enemy.hitbox.w, enemy.hitbox.h)
    ctx.fillStyle = inGrace ? '#ffdc00' : '#00ff00'
    ctx.font = '11px monospace'
    ctx.fillText(`hc:${enemy.hitCount}`, enemy.hitbox.x + 2, enemy.hitbox.y + 12)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  for (const mp of lastMotionPixels) ctx.fillRect(mp.x-1, mp.y-1, 3, 3)
  ctx.fillStyle = 'rgba(255,255,0,0.9)'
  ctx.font = 'bold 12px monospace'
  ctx.fillText('DEBUG [D]', 8, ctx.canvas.height - 8)
  ctx.restore()
}
