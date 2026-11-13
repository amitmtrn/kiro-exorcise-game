import type { Enemy } from '../state'
import { makeEnemy } from '../state'
import { randomId } from './spawnUtils'

export const BOSS_SIZE = 160
export const BOSS_SPEED = 0.0925 // canvas heights per second
export const BOSS_HITS_NEEDED = 10

export function createBoss(canvasW: number, canvasH: number): Enemy {
  // Boss always enters from top-center
  const x = canvasW / 2
  const y = -BOSS_SIZE
  return makeEnemy({
    id: randomId(),
    type: 'boss',
    x, y,
    targetX: canvasW / 2,
    targetY: canvasH / 2,
    speed: BOSS_SPEED,
    sineOffset: 0,
    hitbox: { x: x - BOSS_SIZE / 2, y: y - BOSS_SIZE / 2, w: BOSS_SIZE, h: BOSS_SIZE },
    spawnedAt: performance.now(),
    hitCount: 0,
    bossHitsReceived: 0,
    hitsNeeded: BOSS_HITS_NEEDED,
    summonTimerMs: 3000,
  })
}
