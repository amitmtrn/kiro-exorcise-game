import type { Enemy } from '../state'
import { makeEnemy } from '../state'
import { randomEdgeSpawn, centerTarget, randomId } from './spawnUtils'

export const PUMPKIN_SIZE = 64
export const PUMPKIN_SPEED = 0.9

export function createPumpkin(canvasW: number, canvasH: number, speedMult = 1): Enemy {
  const { x, y } = randomEdgeSpawn(canvasW, canvasH, PUMPKIN_SIZE)
  const { tx, ty } = centerTarget(canvasW, canvasH)
  return makeEnemy({
    id: randomId(),
    type: 'pumpkin',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: PUMPKIN_SPEED * speedMult,
    sineOffset: 0,
    hitbox: { x: x - PUMPKIN_SIZE / 2, y: y - PUMPKIN_SIZE / 2, w: PUMPKIN_SIZE, h: PUMPKIN_SIZE },
    spawnedAt: performance.now(),
    hitCount: 0,
    hitsReceived: 0,
    hitsNeeded: 2,
  })
}
