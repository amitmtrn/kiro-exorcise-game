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
  // Hitboxes are enlarged by 20% (kept centered) so near-swats still register
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
  }
}
