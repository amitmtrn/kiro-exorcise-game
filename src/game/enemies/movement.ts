/**
 * Movement update — moves every enemy one step toward its target.
 * Returns a new array (pure, does not mutate input).
 */

import type { Enemy } from '../state'
import { GHOST_SIZE } from './ghost'
import { BAT_W, BAT_H } from './bat'
import { SKULL_SIZE } from './skull'

/** Amplitude of the ghost's perpendicular sine wobble (px). */
const GHOST_WOBBLE_AMP = 18
/** How many ticks one full wobble cycle takes. */
const GHOST_WOBBLE_SPEED = 0.06

/** Half-amplitude of the bat's zigzag (px). */
const BAT_ZIGZAG_AMP = 24
const BAT_ZIGZAG_SPEED = 0.12

export function moveEnemies(enemies: Enemy[], _deltaMs: number): Enemy[] {
  return enemies.map((enemy) => {
    const dx = enemy.targetX - enemy.x
    const dy = enemy.targetY - enemy.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 0.5) return enemy // already at target

    // Unit vector toward target
    const ux = dx / dist
    const uy = dy / dist

    // Perpendicular vector (for wobble / zigzag)
    const px = -uy
    const py = ux

    let newX: number
    let newY: number
    const newSineOffset = enemy.sineOffset + (enemy.type === 'bat' ? BAT_ZIGZAG_SPEED : GHOST_WOBBLE_SPEED)

    if (enemy.type === 'ghost') {
      const wobble = Math.sin(newSineOffset) * GHOST_WOBBLE_AMP
      newX = enemy.x + ux * enemy.speed + px * wobble * GHOST_WOBBLE_SPEED
      newY = enemy.y + uy * enemy.speed + py * wobble * GHOST_WOBBLE_SPEED
    } else if (enemy.type === 'bat') {
      const zigzag = Math.sin(newSineOffset) * BAT_ZIGZAG_AMP
      newX = enemy.x + ux * enemy.speed + px * zigzag * BAT_ZIGZAG_SPEED
      newY = enemy.y + uy * enemy.speed + py * zigzag * BAT_ZIGZAG_SPEED
    } else {
      // skull — straight line
      newX = enemy.x + ux * enemy.speed
      newY = enemy.y + uy * enemy.speed
    }

    // Recompute hitbox to match new center position
    const hitbox = hitboxFor(enemy.type, newX, newY)

    return { ...enemy, x: newX, y: newY, hitbox, sineOffset: newSineOffset }
  })
}

function hitboxFor(type: Enemy['type'], cx: number, cy: number) {
  switch (type) {
    case 'ghost':
      return { x: cx - GHOST_SIZE / 2, y: cy - GHOST_SIZE / 2, w: GHOST_SIZE, h: GHOST_SIZE }
    case 'bat':
      return { x: cx - BAT_W / 2, y: cy - BAT_H / 2, w: BAT_W, h: BAT_H }
    case 'skull':
      return { x: cx - SKULL_SIZE / 2, y: cy - SKULL_SIZE / 2, w: SKULL_SIZE, h: SKULL_SIZE }
  }
}
