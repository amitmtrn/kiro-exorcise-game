import type { Enemy, Hitbox } from '../state'
import { randomEdgeSpawn, centerTarget, randomId } from './spawnUtils'

export const GHOST_SIZE = 80
export const GHOST_SPEED = 1.2

export function createGhost(canvasW: number, canvasH: number): Enemy {
  const { x, y } = randomEdgeSpawn(canvasW, canvasH, GHOST_SIZE)
  const { tx, ty } = centerTarget(canvasW, canvasH)
  const hitbox: Hitbox = {
    x: x - GHOST_SIZE / 2,
    y: y - GHOST_SIZE / 2,
    w: GHOST_SIZE,
    h: GHOST_SIZE,
  }
  return {
    id: randomId(),
    type: 'ghost',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: GHOST_SPEED,
    sineOffset: Math.random() * Math.PI * 2,
    hitbox,
    spawnedAt: performance.now(),
    hitCount: 0,
  }
}
