/**
 * Grid change protocol helper (playtest-polish R2.3). Kept out of collision.ts so the many tests that
 * mock that module are not affected.
 */

import type { GameState } from './state'
import { setEnemies } from './state'

/** Resets every enemy's 2-frame hit gate and stored swipe centroid. */
export function resetHitGates(state: GameState): GameState {
  if (!state.enemies.some((e) => e.hitCount !== 0 || e.motionX !== undefined || e.motionY !== undefined)) return state
  return setEnemies(state, state.enemies.map((e) => ({ ...e, hitCount: 0, motionX: undefined, motionY: undefined })))
}
