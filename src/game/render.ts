/**
 * Game canvas rendering — fog + candle glow, enemies (procedural canvas
 * shapes), particles, boss health bar, red flash, and optional debug overlay.
 */

import type { GameState, Enemy, Particle, ScoreLabel } from './state'
import { calloutPose } from './callouts'
import type { Callout } from './callouts'
import { TITLE_FONT_FAMILY } from '../ui/fonts'
import { SHAKE_AMPLITUDE_PX } from './state'
import { lastMotionPixels, lastBanished } from './collision'
import { BOSS_HITS_NEEDED } from './enemies/boss'
import { PHASE2_BELOW, PHASE3_BELOW } from './enemies/bossPhases'
import { knockPose } from './knock'
import type { Knock } from './knock'
import { drawAtmosphere } from './atmosphere'
import { getPalette } from '../ui/palette'
import { getSettings } from '../settings/runtime'
import { overlayAlpha, shakeScale } from './flash'
import { calloutPx, scaled } from '../ui/textScale'
import { getQualityInfo, formatQualityLine } from './quality'
import { getMotionGrid } from '../webcam/grid'

/** Active palette (colourblind-safe variant when the setting is on). */
const P = getPalette

// ─── Debug mode ───────────────────────────────────────────────────────────────
let debugMode = false
export function toggleDebug(): void { debugMode = !debugMode }

// ─── Colours ──────────────────────────────────────────────────────────────────
const C_EYE     = '#1a0030'
const C_BAT_W   = '#1a0030'

// ─── Main entry ───────────────────────────────────────────────────────────────

/** Per-view inputs a two-player seat supplies instead of the single-player module globals. */
export interface RenderOpts {
  /** Enemies banished this tick (white flash frame). Default: `lastBanished`. */
  banished?: Enemy[]
  /** Moved pixels for the debug overlay, in this canvas's coordinates. Default: `lastMotionPixels`. */
  motionPixels?: Array<{ x: number; y: number }>
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  opts: RenderOpts = {},
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  // Screen shake (spooky-skin R4.1): jitter the whole frame while shakeFrames > 0
  // Reduced flashing (playtest-polish R10): weaker shake, no white hit silhouette, a capped / ramped / rate-limited
  // flash. The random numbers are drawn either way so a seeded demo replays the same.
  const reduced = getSettings().reducedFlash
  ctx.save()
  if (state.shakeFrames > 0) {
    const k = shakeScale(reduced)
    ctx.translate(
      (Math.random() * 2 - 1) * SHAKE_AMPLITUDE_PX * k,
      (Math.random() * 2 - 1) * SHAKE_AMPLITUDE_PX * k,
    )
  }

  // Atmosphere sits behind everything (spooky-skin R2)
  drawAtmosphere(ctx, now)

  // Enemies — any with hitFlashFrames > 0 render in solid white (spooky-skin R4.2)
  const whiteCtx = whiteFillProxy(ctx)
  for (const enemy of state.enemies) {
    drawEnemy(enemy.hitFlashFrames > 0 && !reduced ? whiteCtx : ctx, enemy, now)
  }
  // Knocked-away enemies (juice R2): the normal enemy routines, rotated, shrunk and faded
  for (const k of state.knocks) drawKnock(ctx, k, now)

  // Enemies banished this frame are gone from state but flash white once;
  // drawn after the knocks so the flash is not covered by the knock's first frame.
  if (state.phase === 'playing' && !reduced) {
    for (const enemy of opts.banished ?? lastBanished) drawEnemy(whiteCtx, enemy, now)
  }

  for (const p of state.particles) drawParticle(ctx, p)
  for (const l of state.scoreLabels) drawScoreLabel(ctx, l)
  for (const c of state.callouts) drawCallout(ctx, c)

  // Boss health bar
  const boss = state.enemies.find(e => e.type === 'boss')
  if (boss) drawBossHealthBar(ctx, boss)

  // Red/orange flash overlay
  const flashAlpha = overlayAlpha(ctx.canvas, state.flashEndTime, now, reduced)
  if (flashAlpha > 0) {
    ctx.save()
    ctx.globalAlpha = flashAlpha
    ctx.fillStyle = P().danger
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.restore()
  }

  if (debugMode) drawDebugOverlay(ctx, state, now, opts.motionPixels ?? lastMotionPixels)

  ctx.restore() // undo shake translate
}

// ─── Knock (juice R2) ─────────────────────────────────────────────────────────
function drawKnock(ctx: CanvasRenderingContext2D, k: Knock, now: number): void {
  const pose = knockPose(k)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, pose.alpha))
  ctx.translate(pose.x, pose.y)
  ctx.rotate(pose.angle)
  ctx.scale(pose.scale, pose.scale)
  // drawEnemy translates to enemy.x/y, so draw the snapshot at the local origin.
  // Targets are made relative too (ghost wisps trail away from the target), and a
  // boss's wind-up / shield visuals are dropped so only its body flies off.
  const e = k.enemy
  drawEnemy(ctx, {
    ...e, x: 0, y: 0,
    targetX: e.targetX - e.x, targetY: e.targetY - e.y,
    ...(e.type === 'boss' ? { bossAttack: 'idle' as const, hitFlashFrames: 1 } : {}),
  }, now)
  ctx.restore()
}

// ─── White-fill proxy (spooky-skin R4.2) ──────────────────────────────────────
// Wraps a context so every fillStyle / strokeStyle / shadowColor write becomes
// white. Lets the normal enemy draw routines produce a solid white silhouette
// for the 1-frame hit flash without a second set of drawing code.
const WHITE = '#ffffff'
function whiteFillProxy(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  return new Proxy(ctx, {
    get(target, key) {
      const v = Reflect.get(target, key)
      return typeof v === 'function' ? v.bind(target) : v
    },
    set(target, key, value) {
      const forced = key === 'fillStyle' || key === 'strokeStyle' || key === 'shadowColor'
      return Reflect.set(target, key, forced ? WHITE : value)
    },
  })
}

// ─── Enemy dispatch ───────────────────────────────────────────────────────────

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number): void {
  ctx.save()
  ctx.translate(enemy.x, enemy.y)
  switch (enemy.type) {
    case 'ghost':   drawGhost(ctx, enemy, now); break
    case 'bat':     drawBat(ctx, enemy, now); break
    case 'skull':   drawSkull(ctx, now); break
    case 'lunger':  drawLunger(ctx, enemy, now); break
    case 'pumpkin': drawPumpkin(ctx, enemy); break
    case 'candy':   drawCandy(ctx, enemy, now); break
    case 'boss':    drawBoss(ctx, enemy, now); break
  }
  ctx.restore()
}

// ─── Ghost ────────────────────────────────────────────────────────────────────
// Spooky-skin R3.1: rounder Casper body, trailing wisps behind the direction of
// travel, big hollow eyes with a highlight, and a small "ooo" mouth.
function drawGhost(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number): void {
  const w = 40, h = 50

  // Unit vector pointing *away* from the target — wisps trail behind.
  const dx = enemy.targetX - enemy.x
  const dy = enemy.targetY - enemy.y
  const d = Math.hypot(dx, dy) || 1
  const bx = -dx / d, by = -dy / d
  // Perpendicular for a gentle side-to-side bob on the wisps.
  const px = -by, py = bx

  ctx.shadowBlur = 0
  ctx.fillStyle = P().ghost
  const wisps = [
    { dist: 30, r: 12, a: 0.40 },
    { dist: 46, r: 9,  a: 0.25 },
    { dist: 60, r: 6,  a: 0.12 },
  ]
  const baseAlpha = ctx.globalAlpha // a knocked-away ghost fades (juice R2)
  wisps.forEach((wsp, i) => {
    const bob = Math.sin(now / 160 + i * 1.4 + enemy.sineOffset) * 5
    const cx = bx * wsp.dist + px * bob
    const cy = by * wsp.dist + py * bob + h * 0.25
    ctx.globalAlpha = baseAlpha * wsp.a
    ctx.beginPath(); ctx.arc(cx, cy, wsp.r, 0, Math.PI * 2); ctx.fill()
  })
  ctx.globalAlpha = baseAlpha

  // Body — dome, bulging sides, three rounded scallops at the hem.
  ctx.shadowColor = 'rgba(232,232,240,0.7)'; ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.arc(0, -h * 0.2, w, Math.PI, 0, false)
  ctx.quadraticCurveTo(w + 5, h * 0.25, w, h * 0.6)
  const bw = (w * 2) / 3
  ctx.quadraticCurveTo(w - bw * 0.5, h * 0.98, w - bw, h * 0.6)
  ctx.quadraticCurveTo(w - bw * 1.5, h * 0.98, w - bw * 2, h * 0.6)
  ctx.quadraticCurveTo(-w + bw * 0.5, h * 0.98, -w, h * 0.6)
  ctx.quadraticCurveTo(-w - 5, h * 0.25, -w, -h * 0.2)
  ctx.closePath(); ctx.fill()

  // Face
  ctx.shadowBlur = 0; ctx.fillStyle = C_EYE
  ctx.beginPath(); ctx.ellipse(-14, -h * 0.05, 7, 9, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(14, -h * 0.05, 7, 9, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(0, h * 0.22, 4, 5, 0, 0, Math.PI * 2); ctx.fill()
  // Eye highlights
  ctx.fillStyle = P().ghost
  ctx.beginPath(); ctx.arc(-12, -h * 0.1, 2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(16, -h * 0.1, 2, 0, Math.PI * 2); ctx.fill()
}

// ─── Bat ──────────────────────────────────────────────────────────────────────
// Spooky-skin R3.1: wing-flap animation — a fast sine drives both the wing-tip
// height and the wingspan (wings foreshorten at the top/bottom of the stroke).
function drawBat(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number): void {
  const flap = Math.sin(now / 70 + enemy.sineOffset)       // -1 … 1
  const tipY = -4 - flap * 11                              // wing-tip height
  const span = 40 * (1 - 0.22 * Math.abs(flap))            // wingspan

  ctx.shadowColor = 'rgba(42,8,69,0.8)'; ctx.shadowBlur = 10
  ctx.fillStyle = C_BAT_W
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(0, 0)
    ctx.bezierCurveTo(side * 10, tipY - 6, side * span * 0.7, tipY - 12, side * span, tipY)
    // Scalloped trailing edge
    ctx.quadraticCurveTo(side * span * 0.78, tipY + 10, side * span * 0.62, tipY + 6)
    ctx.quadraticCurveTo(side * span * 0.45, tipY + 14, side * span * 0.3, 7)
    ctx.quadraticCurveTo(side * 12, 10, 0, 0)
    ctx.closePath(); ctx.fill()
  }

  // Body + ears
  ctx.fillStyle = P().bat
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2); ctx.fill()
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * 3, -8); ctx.lineTo(side * 7, -17); ctx.lineTo(side * 8, -7)
    ctx.closePath(); ctx.fill()
  }

  // Eyes
  ctx.shadowBlur = 0; ctx.fillStyle = P().batEye
  ctx.beginPath(); ctx.arc(-4, -3, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(4, -3, 2.5, 0, Math.PI * 2); ctx.fill()
}

// ─── Skull ────────────────────────────────────────────────────────────────────
// Spooky-skin R3.1: cheekbone shading, a toothy jaw, and a branching crack.
// Still pulses red (steering: "don't hit me").
function drawSkull(ctx: CanvasRenderingContext2D, now: number): void {
  const glow = 10 + Math.sin(now / 300) * 5
  ctx.shadowColor = P().danger; ctx.shadowBlur = glow

  // Cranium + jaw
  ctx.fillStyle = P().skull
  ctx.beginPath(); ctx.arc(0, -4, 22, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.roundRect(-14, 10, 28, 16, 5); ctx.fill()
  ctx.shadowBlur = 0

  // Cheekbone shading — darker orange wedges beside the sockets
  ctx.fillStyle = 'rgba(160, 50, 0, 0.35)'
  ctx.beginPath(); ctx.ellipse(-16, 4, 6, 5, 0.6, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(16, 4, 6, 5, -0.6, 0, Math.PI * 2); ctx.fill()

  // Eye sockets (glowing red) + nose
  ctx.fillStyle = P().skullEye
  ctx.shadowColor = getSettings().cb ? P().danger : '#ff2a1a'; ctx.shadowBlur = 6 + Math.sin(now / 200) * 3
  ctx.beginPath(); ctx.ellipse(-9, -6, 6, 8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(9, -6, 6, 8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.moveTo(0, 2); ctx.lineTo(-3.5, 8); ctx.lineTo(3.5, 8); ctx.closePath(); ctx.fill()

  // Teeth — dark gaps across the jaw
  ctx.strokeStyle = '#8b0000'; ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-14, 18); ctx.lineTo(14, 18)
  for (const tx of [-9, -4.5, 0, 4.5, 9]) { ctx.moveTo(tx, 12); ctx.lineTo(tx, 24) }
  ctx.stroke()

  // Cracked forehead — main fissure with two branches
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(-3, -25); ctx.lineTo(-1, -17); ctx.lineTo(-5, -12); ctx.lineTo(-2, -7)
  ctx.moveTo(-1, -17); ctx.lineTo(4, -15)
  ctx.moveTo(-5, -12); ctx.lineTo(-10, -13)
  ctx.stroke()

  if (getSettings().cb) drawDangerCue(ctx, now)
}

/**
 * Colourblind redundancy for the skull (playtest-polish R8.2): a dashed pulsing ring and a "!" marker, so
 * "do not touch" never depends on its colour. The skull keeps its own shape.
 */
function drawDangerCue(ctx: CanvasRenderingContext2D, now: number): void {
  const danger = P().danger
  ctx.save()
  ctx.shadowBlur = 0
  ctx.strokeStyle = danger
  ctx.lineWidth = 4
  ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 200)
  ctx.setLineDash([9, 7])
  ctx.beginPath(); ctx.arc(0, 2, 40, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(13,0,20,0.9)'
  ctx.strokeText('!', 0, -52)
  ctx.fillStyle = danger
  ctx.fillText('!', 0, -52)
  ctx.restore()
}

// ─── Lunger ───────────────────────────────────────────────────────────────────
function drawLunger(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number): void {
  const isWindup = enemy.movePhase === 'windup'
  // Not hittable yet while approaching: draw it faded (boss-phases R7.2)
  if (enemy.movePhase === 'approach') ctx.globalAlpha = 0.55
  // Scale up slightly during windup to telegraph the lunge
  const scale = isWindup ? 1 + 0.3 * Math.sin(now / 60) : 1
  ctx.scale(scale, scale)
  ctx.shadowColor = P().lunger; ctx.shadowBlur = isWindup ? 20 : 10
  // Purple ghost variant
  ctx.fillStyle = P().lunger
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
  ctx.shadowColor = P().pumpkin; ctx.shadowBlur = damaged ? 20 : 8
  // Body: 3 stacked ellipses
  ctx.fillStyle = P().pumpkin
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

// ─── Candy (waves bonus round) ────────────────────────────────────────────────
// A wrapped sweet: palette-coloured body, twisted wrapper ends, a gentle spin.
function drawCandy(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number): void {
  const candy = P().candy
  const colour = candy[Math.floor(enemy.sineOffset * 4 / (Math.PI * 2)) % candy.length]
  ctx.rotate(Math.sin(now / 300 + enemy.sineOffset) * 0.4)
  ctx.shadowColor = colour; ctx.shadowBlur = 12
  ctx.fillStyle = colour
  // Wrapper twists (two triangles)
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-24, -11); ctx.lineTo(-24, 11); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(24, -11); ctx.lineTo(24, 11); ctx.closePath(); ctx.fill()
  // Body
  ctx.fillStyle = P().ghost
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 11, 0, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = colour; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.stroke()
}

// ─── Boss ─────────────────────────────────────────────────────────────────────
function drawBoss(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number): void {
  const windup = enemy.bossAttack === 'windup'
  const shielded = enemy.bossPhase >= 2 && enemy.bossAttack === 'idle' && enemy.hitFlashFrames === 0
  const enraged = enemy.bossPhase === 3
  const aura = windup ? P().bossWindup : enraged ? P().bossEnraged : '#7b2fbe'

  // Wind-up telegraph (boss-phases R3.2): shake, orange glow, pulsing ring, "!"
  if (windup) {
    ctx.translate(Math.sin(now / 20) * 5, Math.cos(now / 27) * 3)
    const pulse = 0.5 + 0.5 * Math.sin(now / 50)
    ctx.save()
    ctx.shadowBlur = 0
    ctx.strokeStyle = P().bossWindup
    ctx.globalAlpha = 0.45 + 0.4 * pulse
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.arc(0, 0, 110 + 20 * pulse, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
    ctx.save()
    ctx.shadowBlur = 0
    ctx.font = 'bold 56px sans-serif'; ctx.textAlign = 'center'
    ctx.fillStyle = P().bossWindup
    // Above the boss when there is headroom (clear of the HUD title), else beside it.
    if (enemy.y - 105 - 45 >= 50) ctx.fillText('!', 0, -105)
    else ctx.fillText('!', 135, 20)
    ctx.restore()
  }

  // Shield bubble while the boss cannot be hurt (R3.5)
  if (shielded) {
    ctx.save()
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(123,47,190,0.18)'
    ctx.strokeStyle = 'rgba(200,160,255,0.8)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(0, 0, 115, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.restore()
    ctx.globalAlpha = 0.7
  }

  const glow = windup
    ? 30 + Math.sin(now / 50) * 10
    : 14 + Math.sin(now / (enraged ? 180 : 400)) * 6
  ctx.shadowColor = aura; ctx.shadowBlur = glow
  // Enlarged ghost
  const w = 80, h = 100
  ctx.fillStyle = P().boss
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
  // Phase thresholds (boss-phases R5.2)
  ctx.fillStyle = '#ffd166'
  for (const t of [PHASE2_BELOW, PHASE3_BELOW]) ctx.fillRect(x + barW * t - 1, y - 3, 2, barH + 6)
  // Label
  ctx.fillStyle = boss.bossPhase === 3 ? P().bossWindup : P().ghost
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  const tag = boss.bossPhase === 3 ? 'ENRAGED' : `PHASE ${boss.bossPhase}`
  ctx.fillText(`👻 BOSS ${tag}  ${remaining} / ${BOSS_HITS_NEEDED}`, W / 2, y - 6)
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

// ─── Score pop label (spooky-skin R5.2) ───────────────────────────────────────
function drawScoreLabel(ctx: CanvasRenderingContext2D, l: ScoreLabel): void {
  ctx.save()
  ctx.globalAlpha = Math.max(0, l.alpha)
  ctx.font = `bold ${scaled(26)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(13,0,20,0.85)'
  ctx.strokeText(l.text, l.x, l.y)
  ctx.shadowColor = P().score; ctx.shadowBlur = 12
  ctx.fillStyle = P().score
  ctx.fillText(l.text, l.x, l.y)
  ctx.restore()
}

// ─── Combo call-out (juice R4) ────────────────────────────────────────────────
function drawCallout(ctx: CanvasRenderingContext2D, c: Callout): void {
  const pose = calloutPose(c)
  const fontPx = calloutPx(ctx.canvas.width, c.x, [...c.text].length)
  const color = c.kind === 'tierUp' ? P().combo : P().score
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, pose.alpha))
  ctx.translate(c.x, c.y + pose.dy)
  ctx.scale(pose.scale, pose.scale)
  ctx.rotate(c.kind === 'tierUp' ? -0.08 : 0.06)
  ctx.font = `${fontPx}px ${TITLE_FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(13,0,20,0.9)'
  ctx.strokeText(c.text, 0, 0)
  ctx.shadowColor = color; ctx.shadowBlur = 18
  ctx.fillStyle = color
  ctx.fillText(c.text, 0, 0)
  ctx.restore()
}

// ─── Debug overlay ────────────────────────────────────────────────────────────
function drawDebugOverlay(
  ctx: CanvasRenderingContext2D, state: GameState, now: number, motionPixels: Array<{ x: number; y: number }>,
): void {
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
  for (const mp of motionPixels) ctx.fillRect(mp.x-1, mp.y-1, 3, 3)
  ctx.fillStyle = 'rgba(255,255,0,0.9)'
  ctx.font = 'bold 12px monospace'
  ctx.fillText('DEBUG [D]', 8, ctx.canvas.height - 8)
  ctx.fillText(formatQualityLine(getQualityInfo(), getMotionGrid()), 8, ctx.canvas.height - 24)
  ctx.restore()
}
