import type { Enemy, Hitbox } from '../state'
import { randomEdgeSpawn, centerTarget, randomId } from './spawnUtils'

export const BAT_W = 48
export const BAT_H = 32
export const BAT_SPEED = 2.0

export function createBat(canvasW: number, canvasH: number): Enemy {
  const { x, y } = randomEdgeSpawn(canvasW, canvasH, Math.max(BAT_W, BAT_H))
  const { tx, ty } = centerTarget(canvasW, canvasH)
  const hitbox: Hitbox = {
    x: x - BAT_W / 2,
    y: y - BAT_H / 2,
    w: BAT_W,
    h: BAT_H,
  }
  return {
    id: randomId(),
    type: 'bat',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: BAT_SPEED,
    sineOffset: Math.random() * Math.PI * 2,
    hitbox,
    spawnedAt: performance.now(),
    hitCount: 0,
  }
}
