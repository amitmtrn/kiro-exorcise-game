/**
 * Movement update — moves every enemy one deltaMs-scaled step toward its target.
 * Returns a new array (pure, does not mutate input).
 */

import type { Enemy } from '../state'
import { GHOST_SIZE } from './ghost'
import { BAT_W, BAT_H } from './bat'
import { SKULL_SIZE, SKULL_ON_SCREEN_MS, SKULL_EXIT_SPEED_MULT } from './skull'
import { LUNGER_SIZE, WINDUP_DURATION_MS } from './lunger'
import { PUMPKIN_SIZE } from './pumpkin'
import { BOSS_SIZE } from './boss'
import { moveBoss } from './bossPhases'

/** Sine phase rate, rad/s (the old per-frame step × 60). */
const GHOST_WOBBLE_RATE = 3.6
const BAT_ZIGZAG_RATE = 7.2
/** Peak lateral velocity, in canvas heights per second. */
const GHOST_WOBBLE_AMP = 0.06
const BAT_ZIGZAG_AMP = 0.16

/** Lunger stops to wind up this far from its target, in canvas heights. */
const LUNGER_HOLD_HEIGHTS = 0.185
const LUNGE_SPEED_MULT = 2.5

export function moveEnemies(
  enemies: Enemy[],
  deltaMs: number,
  canvasW: number,
  canvasH: number,
): Enemy[] {
  return enemies.map((enemy) => moveSingle(enemy, deltaMs, canvasW, canvasH))
}

/** Straight-line step toward the target, never overshooting it. */
function stepToward(enemy: Enemy, pxPerSec: number, deltaMs: number) {
  const dx = enemy.targetX - enemy.x
  const dy = enemy.targetY - enemy.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return { ux: 0, uy: 0, step: 0, dist }
  return { ux: dx / dist, uy: dy / dist, step: Math.min(dist, pxPerSec * deltaMs / 1000), dist }
}

/** Skull lifecycle: count on-screen time, then turn around and leave. */
function tickSkull(enemy: Enemy, deltaMs: number, canvasW: number, canvasH: number): Enemy {
  if (enemy.exiting) return enemy
  const inside = enemy.x >= 0 && enemy.x <= canvasW && enemy.y >= 0 && enemy.y <= canvasH
  if (!inside) return enemy
  const onScreenMs = enemy.onScreenMs + deltaMs
  if (onScreenMs < SKULL_ON_SCREEN_MS) return { ...enemy, onScreenMs }

  // Leave through the side it is nearest to (straight out from the centre).
  let dx = enemy.x - canvasW / 2
  let dy = enemy.y - canvasH / 2
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) { dx = 0; dy = -1 } else { dx /= len; dy /= len }
  const far = canvasW + canvasH
  return {
    ...enemy,
    onScreenMs,
    exiting: true,
    targetX: enemy.x + dx * far,
    targetY: enemy.y + dy * far,
    speed: enemy.speed * SKULL_EXIT_SPEED_MULT,
  }
}

/** Removes exiting skulls whose hitbox is entirely outside the canvas. */
export function cullExitedEnemies(enemies: Enemy[], canvasW: number, canvasH: number): Enemy[] {
  return enemies.filter((e) => {
    if (e.type !== 'skull' || !e.exiting) return true
    const { x, y, w, h } = e.hitbox
    return !(x + w < 0 || x > canvasW || y + h < 0 || y > canvasH)
  })
}

function moveSingle(enemy: Enemy, deltaMs: number, canvasW: number, canvasH: number): Enemy {
  if (enemy.type === 'boss') return moveBoss(enemy, deltaMs, canvasW, canvasH)
  if (enemy.type === 'lunger') return moveLunger(enemy, deltaMs, canvasH)
  if (enemy.type === 'skull') enemy = tickSkull(enemy, deltaMs, canvasW, canvasH)

  const { ux, uy, step, dist } = stepToward(enemy, enemy.speed * canvasH, deltaMs)
  if (dist < 0.5) return enemy

  const dt = deltaMs / 1000
  const px = -uy
  const py = ux
  const rate = enemy.type === 'bat' ? BAT_ZIGZAG_RATE : GHOST_WOBBLE_RATE
  const newSineOffset = enemy.sineOffset + rate * dt

  let newX = enemy.x + ux * step
  let newY = enemy.y + uy * step

  if (enemy.type === 'ghost' || enemy.type === 'bat') {
    const amp = enemy.type === 'bat' ? BAT_ZIGZAG_AMP : GHOST_WOBBLE_AMP
    // Sample the sine at the step midpoint so the integral is step-size independent.
    const lateral = Math.sin(enemy.sineOffset + rate * dt / 2) * amp * canvasH * dt
    newX += px * lateral
    newY += py * lateral
  }
  // skull, pumpkin — straight line

  const hitbox = hitboxFor(enemy.type, newX, newY)
  return { ...enemy, x: newX, y: newY, hitbox, sineOffset: newSineOffset }
}

function moveLunger(enemy: Enemy, deltaMs: number, canvasH: number): Enemy {
  const dist = Math.hypot(enemy.targetX - enemy.x, enemy.targetY - enemy.y)

  if (enemy.movePhase === 'approach') {
    if (dist <= LUNGER_HOLD_HEIGHTS * canvasH) {
      return { ...enemy, movePhase: 'windup', phaseTimer: WINDUP_DURATION_MS }
    }
    return advanceLunger(enemy, enemy.speed * canvasH, deltaMs)
  }

  if (enemy.movePhase === 'windup') {
    const phaseTimer = enemy.phaseTimer - deltaMs
    if (phaseTimer <= 0) {
      return { ...enemy, movePhase: 'lunge', phaseTimer: 0 }
    }
    return { ...enemy, phaseTimer }
  }

  // lunge — 2.5× speed
  return advanceLunger(enemy, enemy.speed * canvasH * LUNGE_SPEED_MULT, deltaMs)
}

function advanceLunger(enemy: Enemy, pxPerSec: number, deltaMs: number): Enemy {
  const { ux, uy, step, dist } = stepToward(enemy, pxPerSec, deltaMs)
  if (dist < 0.5) return enemy
  const newX = enemy.x + ux * step
  const newY = enemy.y + uy * step
  return { ...enemy, x: newX, y: newY, hitbox: hitboxFor('lunger', newX, newY) }
}

export function hitboxFor(type: Enemy['type'], cx: number, cy: number) {
  const scale = 1.2
  switch (type) {
    case 'ghost': {
      const w = GHOST_SIZE * scale, h = GHOST_SIZE * scale
      return { x: cx - w / 2, y: cy - h / 2, w, h }
    }
    case 'bat': {
      const w = BAT_W * scale, h = BAT_H * scale
      return { x: cx - w / 2, y: cy - h / 2, w, h }
    }
    case 'skull': {
      const w = SKULL_SIZE * scale, h = SKULL_SIZE * scale
      return { x: cx - w / 2, y: cy - h / 2, w, h }
    }
    case 'lunger': {
      const w = LUNGER_SIZE * scale, h = LUNGER_SIZE * scale
      return { x: cx - w / 2, y: cy - h / 2, w, h }
    }
    case 'pumpkin': {
      const w = PUMPKIN_SIZE * scale, h = PUMPKIN_SIZE * scale
      return { x: cx - w / 2, y: cy - h / 2, w, h }
    }
    case 'boss': {
      const w = BOSS_SIZE * scale, h = BOSS_SIZE * scale
      return { x: cx - w / 2, y: cy - h / 2, w, h }
    }
  }
}
