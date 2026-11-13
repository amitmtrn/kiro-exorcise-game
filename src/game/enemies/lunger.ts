import type { Enemy } from '../state'
import { makeEnemy } from '../state'
import { randomEdgeSpawn, centerTarget, randomId } from './spawnUtils'

export const LUNGER_SIZE = 72
export const LUNGER_SPEED = 0.185 // canvas heights per second
export const WINDUP_DURATION_MS = 600

export function createLunger(canvasW: number, canvasH: number, speedMult = 1): Enemy {
  const { x, y } = randomEdgeSpawn(canvasW, canvasH, LUNGER_SIZE)
  const { tx, ty } = centerTarget(canvasW, canvasH)
  return makeEnemy({
    id: randomId(),
    type: 'lunger',
    x, y,
    targetX: tx,
    targetY: ty,
    speed: LUNGER_SPEED * speedMult,
    sineOffset: 0,
    hitbox: { x: x - LUNGER_SIZE / 2, y: y - LUNGER_SIZE / 2, w: LUNGER_SIZE, h: LUNGER_SIZE },
    spawnedAt: performance.now(),
    hitCount: 0,
    movePhase: 'approach',
    phaseTimer: 0,
  })
}
