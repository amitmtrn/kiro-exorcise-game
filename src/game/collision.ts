/**
 * Hit resolution — runs frame differencing on each active enemy's hitbox
 * and applies the game-state consequences.
 */

import type { GameState } from './state'
import { removeEnemy, addScore, decrementLife, addParticles, setFlash } from './state'
import { computeFrameDiff } from '../webcam/diff'
import { spawnGhostPuff, spawnBatPuff } from './particles'

export interface HitResult {
  state: GameState
  flashEndTime: number
}

/**
 * For each active enemy, check frame diff inside its hitbox.
 * Applies scoring, life loss, particles, and flash side-effects.
 *
 * @param state       Current game state
 * @param currentData Full-canvas ImageData for the current frame
 * @param prevData    Full-canvas ImageData for the previous frame
 * @param canvasWidth Width of the canvas (used for ImageData indexing)
 * @param now         Current `performance.now()` timestamp
 */
export function resolveHits(
  state: GameState,
  currentData: ImageData,
  prevData: ImageData,
  canvasWidth: number,
  now: number,
): GameState {
  let s = state
  let flashEndTime = s.flashEndTime

  for (const enemy of state.enemies) {
    const hit = computeFrameDiff(currentData, prevData, enemy.hitbox, canvasWidth)
    if (!hit) continue

    if (enemy.type === 'ghost') {
      s = removeEnemy(s, enemy.id)
      s = addScore(s, 100)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
    } else if (enemy.type === 'bat') {
      s = removeEnemy(s, enemy.id)
      s = addScore(s, 50)
      s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
    } else if (enemy.type === 'skull') {
      s = removeEnemy(s, enemy.id)
      s = decrementLife(s)
      flashEndTime = now + 300
      s = setFlash(s, flashEndTime)
    }
  }

  return s
}
