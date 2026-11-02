/**
 * Movement update — moves every enemy one step toward its target.
 * Returns a new array (pure, does not mutate input).
 */

import type { Enemy } from '../state'
import { GHOST_SIZE } from './ghost'
import { BAT_W, BAT_H } from './bat'
import { SKULL_SIZE } from './skull'
import { LUNGER_SIZE, WINDUP_DURATION_MS } from './lunger'
import { PUMPKIN_SIZE } from './pumpkin'
import { BOSS_SIZE } from './boss'

const GHOST_WOBBLE_AMP = 18
const GHOST_WOBBLE_SPEED = 0.06
const BAT_ZIGZAG_AMP = 24
const BAT_ZIGZAG_SPEED = 0.12

/** Distance from center at which the lunger stops to wind up. */
const LUNGER_HOLD_DIST = 200

export function moveEnemies(enemies: Enemy[], deltaMs: number): Enemy[] {
  return enemies.map((enemy) => moveSingle(enemy, deltaMs))
}

function moveSingle(enemy: Enemy, deltaMs: number): Enemy {
  if (enemy.type === 'lunger') return moveLunger(enemy, deltaMs)

  const dx = enemy.targetX - enemy.x
  const dy = enemy.targetY - enemy.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 0.5) return enemy

  const ux = dx / dist
  const uy = dy / dist
  const px = -uy
  const py = ux
  const newSineOffset = enemy.sineOffset +
    (enemy.type === 'bat' ? BAT_ZIGZAG_SPEED : GHOST_WOBBLE_SPEED)

  let newX: number
  let newY: number

  if (enemy.type === 'ghost') {
    const wobble = Math.sin(newSineOffset) * GHOST_WOBBLE_AMP
    newX = enemy.x + ux * enemy.speed + px * wobble * GHOST_WOBBLE_SPEED
    newY = enemy.y + uy * enemy.speed + py * wobble * GHOST_WOBBLE_SPEED
  } else if (enemy.type === 'bat') {
    const zigzag = Math.sin(newSineOffset) * BAT_ZIGZAG_AMP
    newX = enemy.x + ux * enemy.speed + px * zigzag * BAT_ZIGZAG_SPEED
    newY = enemy.y + uy * enemy.speed + py * zigzag * BAT_ZIGZAG_SPEED
  } else {
    // skull, pumpkin, boss — straight line
    newX = enemy.x + ux * enemy.speed
    newY = enemy.y + uy * enemy.speed
  }

  const hitbox = hitboxFor(enemy.type, newX, newY)
  return { ...enemy, x: newX, y: newY, hitbox, sineOffset: newSineOffset }
}

function moveLunger(enemy: Enemy, deltaMs: number): Enemy {
  const dx = enemy.targetX - enemy.x
  const dy = enemy.targetY - enemy.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (enemy.movePhase === 'approach') {
    if (dist <= LUNGER_HOLD_DIST) {
      return { ...enemy, movePhase: 'windup', phaseTimer: WINDUP_DURATION_MS }
    }
    if (dist < 0.5) return enemy
    const ux = dx / dist
    const uy = dy / dist
    const newX = enemy.x + ux * enemy.speed
    const newY = enemy.y + uy * enemy.speed
    return { ...enemy, x: newX, y: newY, hitbox: hitboxFor('lunger', newX, newY) }
  }

  if (enemy.movePhase === 'windup') {
    const phaseTimer = enemy.phaseTimer - deltaMs
    if (phaseTimer <= 0) {
      return { ...enemy, movePhase: 'lunge', phaseTimer: 0 }
    }
    return { ...enemy, phaseTimer }
  }

  // lunge — move at 2.5× speed
  if (dist < 0.5) return enemy
  const ux = dx / dist
  const uy = dy / dist
  const newX = enemy.x + ux * enemy.speed * 2.5
  const newY = enemy.y + uy * enemy.speed * 2.5
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
