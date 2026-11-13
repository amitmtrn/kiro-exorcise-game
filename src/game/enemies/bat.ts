import type { Enemy } from '../state'
import { makeEnemy } from '../state'
import { randomEdgeSpawn, centerTarget, randomId } from './spawnUtils'

export const BAT_W = 48
export const BAT_H = 32
export const BAT_SPEED = 0.37 // canvas heights per second

export function createBat(canvasW: number, canvasH: number, speedMult = 1): Enemy {
  const { x, y } = randomEdgeSpawn(canvasW, canvasH, Math.max(BAT_W, BAT_H))
  const { tx, ty } = centerTarget(canvasW, canvasH)
  return makeEnemy({
    id: randomId(),
    type: 'bat',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: BAT_SPEED * speedMult,
    sineOffset: Math.random() * Math.PI * 2,
    hitbox: { x: x - BAT_W / 2, y: y - BAT_H / 2, w: BAT_W, h: BAT_H },
    spawnedAt: performance.now(),
    hitCount: 0,
  })
}
