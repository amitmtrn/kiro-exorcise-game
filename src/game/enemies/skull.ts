import type { Enemy, Hitbox } from '../state'
import { randomEdgeSpawn, centerTarget, randomId } from './spawnUtils'

export const SKULL_SIZE = 56
export const SKULL_SPEED = 0.8

export function createSkull(canvasW: number, canvasH: number): Enemy {
  const { x, y } = randomEdgeSpawn(canvasW, canvasH, SKULL_SIZE)
  const { tx, ty } = centerTarget(canvasW, canvasH)
  const hitbox: Hitbox = {
    x: x - SKULL_SIZE / 2,
    y: y - SKULL_SIZE / 2,
    w: SKULL_SIZE,
    h: SKULL_SIZE,
  }
  return {
    id: randomId(),
    type: 'skull',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: SKULL_SPEED,
    sineOffset: Math.random() * Math.PI * 2,
    hitbox,
  }
}
