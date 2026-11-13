import type { Enemy } from '../state'
import { makeEnemy } from '../state'
import { randomEdgeSpawn, centerTarget, randomId } from './spawnUtils'

export const SKULL_SIZE = 56
export const SKULL_SPEED = 0.148 // canvas heights per second

export function createSkull(canvasW: number, canvasH: number, speedMult = 1): Enemy {
  const { x, y } = randomEdgeSpawn(canvasW, canvasH, SKULL_SIZE)
  const { tx, ty } = centerTarget(canvasW, canvasH)
  return makeEnemy({
    id: randomId(),
    type: 'skull',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: SKULL_SPEED * speedMult,
    sineOffset: Math.random() * Math.PI * 2,
    hitbox: { x: x - SKULL_SIZE / 2, y: y - SKULL_SIZE / 2, w: SKULL_SIZE, h: SKULL_SIZE },
    spawnedAt: performance.now(),
    hitCount: 0,
  })
}
