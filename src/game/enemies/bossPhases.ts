/**
 * Boss phase state machine (boss-phases spec). Pure: no DOM, no canvas.
 *
 * Phase is derived from remaining health: 1 (≥ 66 %), 2 (< 66 %), 3 (< 33 %).
 * Phase 1 summons minions while swaying along the top. Phases 2–3 add a
 * telegraphed lunge (idle → windup → lunge → recover) and are only vulnerable
 * from the start of the wind-up until the recovery ends.
 */

import type { Enemy, GameState } from '../state'
import { makeEnemy, setEnemies, decrementLife, resetCombo, setShake, SHAKE_FRAMES } from '../state'
import { BOSS_SIZE } from './boss'
import { GHOST_SIZE, GHOST_SPEED } from './ghost'
import { centerTarget, randomId } from './spawnUtils'
import { spawnVariantAt } from './variantSpawn'
import { withTip } from '../finale'
import type { VariantType } from './variants'

export const PHASE2_BELOW = 0.66
export const PHASE3_BELOW = 0.33
/** Ignore further hits for this long after one lands (R5.1). */
export const HIT_COOLDOWN_MS = 400
/** A lunge that gets this close to its target counts as a strike (R3.3). */
export const STRIKE_RADIUS = 40
/** Hitbox scale shared with movement.hitboxFor. */
const HITBOX_SCALE = 1.2
/** Steering speed to/along the hover line, canvas heights per second. */
const HOME_SPEED = 0.6
const HOVER_TOLERANCE_PX = 4
/** Largest summon overshoot carried into the next interval. */
const SUMMON_CARRY_MAX_MS = 100
const SWAY_AMPLITUDE = 0.3 // fraction of canvas width

export type BossPhase = 1 | 2 | 3

export interface PhaseParams {
  idleMs: number
  windupMs: number
  recoverMs: number
  lungeSpeed: number // canvas heights per second
  swayRate: number   // rad/s
  summonEveryMs: number
  summonCount: number
  maxMinions: number
  attacks: boolean
}

/** All boss balance numbers live here. */
export const PHASE_PARAMS: Record<BossPhase, PhaseParams> = {
  1: { idleMs: 0, windupMs: 0, recoverMs: 0, lungeSpeed: 0, swayRate: 0.5,
       summonEveryMs: 5000, summonCount: 1, maxMinions: 3, attacks: false },
  2: { idleMs: 3000, windupMs: 600, recoverMs: 1200, lungeSpeed: 1.0, swayRate: 0.7,
       summonEveryMs: 6000, summonCount: 1, maxMinions: 3, attacks: true },
  3: { idleMs: 1500, windupMs: 350, recoverMs: 700, lungeSpeed: 1.5, swayRate: 1.1,
       summonEveryMs: 3500, summonCount: 2, maxMinions: 5, attacks: true },
}

/** The Hollow King (more-content R6): longer telegraphs (>= 400 ms), slower lunges, new ghosts as minions. */
export const FINALE_PARAMS: Record<BossPhase, PhaseParams> = {
  1: { idleMs: 0, windupMs: 0, recoverMs: 0, lungeSpeed: 0, swayRate: 0.5,
       summonEveryMs: 6000, summonCount: 1, maxMinions: 2, attacks: false },
  2: { idleMs: 3000, windupMs: 700, recoverMs: 1400, lungeSpeed: 0.9, swayRate: 0.7,
       summonEveryMs: 8000, summonCount: 1, maxMinions: 4, attacks: true },
  3: { idleMs: 2000, windupMs: 450, recoverMs: 900, lungeSpeed: 1.3, swayRate: 1.1,
       summonEveryMs: 7000, summonCount: 1, maxMinions: 3, attacks: true },
}

/** Parameters of this boss: the Hollow King has its own table. */
export function paramsFor(boss: Pick<Enemy, 'finale' | 'bossPhase'>, phase: BossPhase = boss.bossPhase): PhaseParams {
  return (boss.finale ? FINALE_PARAMS : PHASE_PARAMS)[phase]
}

/** Types that count against the minion cap of the finale boss. */
const FINALE_MINIONS: readonly Enemy['type'][] = ['blink', 'wisp', 'mirror', 'ghost']

/** New ghosts a finale summon makes in `phase` (`n` = summons so far): blink / wisp pair / mirror (+ blink every other one). */
export function finaleMinionKinds(phase: BossPhase, n: number): VariantType[] {
  if (phase === 1) return ['blink']
  if (phase === 2) return ['wisp']
  return n % 2 === 1 ? ['mirror', 'blink'] : ['mirror']
}

/** Phase for `received` hits out of `needed` (R1.1). */
export function bossPhaseFor(received: number, needed: number): BossPhase {
  const remaining = Math.max(0, needed - received) / needed
  if (remaining < PHASE3_BELOW) return 3
  if (remaining < PHASE2_BELOW) return 2
  return 1
}

/** y the boss hovers at while idle (R2.1). */
export function hoverY(canvasH: number): number {
  return Math.max(0.2 * canvasH, BOSS_SIZE * 0.75)
}

/** True when the boss is on its hover line (summons and wind-ups only start here, R3.7). */
export function atHover(boss: Enemy, canvasH: number): boolean {
  return Math.abs(boss.y - hoverY(canvasH)) <= HOVER_TOLERANCE_PX
}

/** Shielded in phases 2–3 while idle; every hit is followed by i-frames (R3.5, R5.1). */
export function isBossVulnerable(boss: Enemy): boolean {
  if (boss.bossInvulnMs > 0) return false
  return boss.bossPhase === 1 || boss.bossAttack !== 'idle'
}

export interface BossHitResult {
  boss: Enemy
  defeated: boolean
  phaseChanged: boolean
}

/** Applies one hit: health, phase change (R1.3), stagger (R3.6) and i-frames. */
export function onBossHit(boss: Enemy): BossHitResult {
  const received = boss.bossHitsReceived + 1
  const defeated = received >= boss.hitsNeeded
  const phase = bossPhaseFor(received, boss.hitsNeeded)
  const phaseChanged = phase !== boss.bossPhase
  let next: Enemy = {
    ...boss,
    bossHitsReceived: received,
    bossPhase: phase,
    bossInvulnMs: HIT_COOLDOWN_MS,
    hitCount: 0,
    hitFlashFrames: 1,
  }
  if (phaseChanged) {
    next = {
      ...next,
      bossAttack: 'idle',
      bossTimerMs: paramsFor(boss, phase).idleMs,
      summonTimerMs: 0, // queue an immediate summon
      bossStrike: false,
    }
  } else if (boss.bossAttack === 'windup' || boss.bossAttack === 'lunge') {
    next = { ...next, bossAttack: 'recover', bossTimerMs: paramsFor(boss, phase).recoverMs }
  }
  return { boss: next, defeated, phaseChanged }
}

function bossHitbox(x: number, y: number) {
  const s = BOSS_SIZE * HITBOX_SCALE
  return { x: x - s / 2, y: y - s / 2, w: s, h: s }
}

function steer(boss: Enemy, tx: number, ty: number, pxPerSec: number, dt: number): Enemy {
  const dx = tx - boss.x
  const dy = ty - boss.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return boss
  const step = Math.min(dist, pxPerSec * dt)
  const x = boss.x + (dx / dist) * step
  const y = boss.y + (dy / dist) * step
  return { ...boss, x, y, hitbox: bossHitbox(x, y) }
}

/** Advances timers, the attack cycle and position by `deltaMs`. */
export function moveBoss(boss: Enemy, deltaMs: number, canvasW: number, canvasH: number): Enemy {
  const dt = deltaMs / 1000
  const p = paramsFor(boss)
  let b: Enemy = boss
  if (b.bossInvulnMs > 0) b = { ...b, bossInvulnMs: Math.max(0, b.bossInvulnMs - deltaMs) }
  // The summon timer runs in every attack state; a due summon waits for idle + hover (R3.7).
  b = { ...b, summonTimerMs: b.summonTimerMs - deltaMs }

  switch (b.bossAttack) {
    case 'idle': {
      const sineOffset = b.sineOffset + p.swayRate * dt
      const homeX = canvasW / 2 + Math.sin(sineOffset) * SWAY_AMPLITUDE * canvasW
      const homeY = hoverY(canvasH)
      b = steer({ ...b, sineOffset },
        homeX, homeY, HOME_SPEED * canvasH, dt)
      if (p.attacks && atHover(b, canvasH)) {
        const bossTimerMs = b.bossTimerMs - deltaMs
        // Carry the overshoot into the next stage so frame rate doesn't add drift.
        b = bossTimerMs <= 0
          ? { ...b, bossAttack: 'windup', bossTimerMs: p.windupMs + bossTimerMs }
          : { ...b, bossTimerMs }
      }
      return b
    }
    case 'windup': {
      const bossTimerMs = b.bossTimerMs - deltaMs
      return bossTimerMs <= 0
        ? { ...b, bossAttack: 'lunge', bossTimerMs: 0 } // overshoot ignored: lunge is distance-driven
        : { ...b, bossTimerMs }
    }
    case 'lunge': {
      const tx = canvasW / 2, ty = canvasH / 2 // current centre, survives a resize
      b = steer(b, tx, ty, p.lungeSpeed * canvasH, dt)
      const dist = Math.hypot(tx - b.x, ty - b.y)
      return dist <= STRIKE_RADIUS
        ? { ...b, bossAttack: 'recover', bossTimerMs: p.recoverMs, bossStrike: true }
        : b
    }
    case 'recover': {
      const bossTimerMs = b.bossTimerMs - deltaMs
      return bossTimerMs <= 0
        ? { ...b, bossAttack: 'idle', bossTimerMs: p.idleMs + bossTimerMs }
        : { ...b, bossTimerMs }
    }
  }
}

/** A small ghost summoned from the boss (R2.2). */
export function createMinion(boss: Enemy, canvasW: number, canvasH: number): Enemy {
  const { tx, ty } = centerTarget(canvasW, canvasH)
  const x = boss.x + (Math.random() * 2 - 1) * 60
  const y = boss.y
  return makeEnemy({
    id: randomId(),
    type: 'ghost',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: GHOST_SPEED * 0.9,
    sineOffset: Math.random() * Math.PI * 2,
    hitbox: { x: x - GHOST_SIZE / 2, y: y - GHOST_SIZE / 2, w: GHOST_SIZE, h: GHOST_SIZE },
    spawnedAt: performance.now(),
  })
}

/** State-level boss work: lunge strikes cost a life, idle bosses summon (R3.3, R2.2, R3.7). */
export function tickBoss(state: GameState, canvasW: number, canvasH: number): GameState {
  if (state.phase !== 'playing') return state
  const boss = state.enemies.find((e) => e.type === 'boss')
  if (!boss) return state
  let s = state
  let b = boss

  if (b.bossStrike) {
    b = { ...b, bossStrike: false }
    s = setEnemies(s, s.enemies.map((e) => (e.id === b.id ? b : e)))
    s = decrementLife(s)
    s = resetCombo(s)
    s = setShake(s, SHAKE_FRAMES * 2)
    if (s.phase !== 'playing') return s
  }

  // Only at the hover line: a boss flying home from the centre keeps the summon queued.
  if (b.bossAttack === 'idle' && b.summonTimerMs <= 0 && atHover(b, canvasH)) {
    const p = paramsFor(b)
    // Carry a small overshoot so cadence doesn't drift; a long wait for the hover line is not carried.
    const nextTimer = p.summonEveryMs + Math.max(b.summonTimerMs, -SUMMON_CARRY_MAX_MS)
    if (b.finale) {
      const alive = s.enemies.filter((e) => FINALE_MINIONS.includes(e.type)).length
      const kinds = finaleMinionKinds(b.bossPhase, b.vHits)
      const made = alive + kinds.reduce((a, k) => a + (k === 'wisp' ? 2 : 1), 0) <= p.maxMinions
        ? kinds.flatMap((k) => spawnVariantAt(k, b.x, b.y, canvasW, canvasH))
        : []
      const nb: Enemy = { ...b, summonTimerMs: nextTimer, vHits: made.length > 0 ? b.vHits + 1 : b.vHits }
      s = setEnemies(s, [...s.enemies.map((e) => (e.id === nb.id ? nb : e)), ...made])
      // A type whose scripted event was dropped still gets its first-sighting tip when the king summons it.
      if (made.length > 0) for (const k of kinds) s = withTip(s, k, b.x, b.y, canvasW, canvasH)
      return s
    }
    const alive = s.enemies.filter((e) => e.type === 'ghost').length
    const n = Math.max(0, Math.min(p.summonCount, p.maxMinions - alive))
    const minions = Array.from({ length: n }, () => createMinion(b, canvasW, canvasH))
    const nb: Enemy = { ...b, summonTimerMs: nextTimer }
    s = setEnemies(s, [...s.enemies.map((e) => (e.id === nb.id ? nb : e)), ...minions])
  }
  return s
}
