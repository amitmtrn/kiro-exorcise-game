import type { Enemy } from '../state'
import { makeEnemy } from '../state'
import { randomEdgeSpawn, centerTarget, randomId } from './spawnUtils'

export const GHOST_SIZE = 80
export const GHOST_SPEED = 0.222 // canvas heights per second

export function createGhost(canvasW: number, canvasH: number, speedMult = 1): Enemy {
  const { x, y } = randomEdgeSpawn(canvasW, canvasH, GHOST_SIZE)
  const { tx, ty } = centerTarget(canvasW, canvasH)
  const size = GHOST_SIZE
  return makeEnemy({
    id: randomId(),
    type: 'ghost',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: GHOST_SPEED * speedMult,
    sineOffset: Math.random() * Math.PI * 2,
    hitbox: { x: x - size / 2, y: y - size / 2, w: size, h: size },
    spawnedAt: performance.now(),
    hitCount: 0,
  })
}
