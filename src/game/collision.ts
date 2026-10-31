/**
 * Hit resolution — runs frame differencing on each active enemy's hitbox
 * and applies the game-state consequences.
 */

import type { GameState, Enemy } from './state'
import { addScore, decrementLife, addParticles, setFlash, setEnemies } from './state'
import { computeFrameDiff, scaleHitbox, MOTION_W } from '../webcam/diff'
import { spawnGhostPuff, spawnBatPuff } from './particles'

/** Spawn grace period — no hits registered within this many ms of spawn. */
const SPAWN_GRACE_MS = 300

/** Consecutive diff-true frames required before a hit fires. */
const HIT_FRAMES_REQUIRED = 2

/**
 * Display-space coordinates of pixels that exceeded DIFF_THRESHOLD last frame.
 * Populated by resolveHits, read by the debug overlay in render.ts.
 * Reset at the start of each resolveHits call.
 */
export let lastMotionPixels: Array<{ x: number; y: number }> = []

/**
 * For each active enemy, check frame diff inside its hitbox.
 * Applies scoring, life loss, particles, flash, and 2-frame confirmation gate.
 *
 * @param state       Current game state
 * @param currentData Full-canvas ImageData for the current frame (motion canvas)
 * @param prevData    Full-canvas ImageData for the previous frame (motion canvas)
 * @param displayW    Width of the display canvas (for hitbox scaling)
 * @param displayH    Height of the display canvas
 * @param now         Current `performance.now()` timestamp
 */
export function resolveHits(
  state: GameState,
  currentData: ImageData,
  prevData: ImageData,
  displayW: number,
  displayH: number,
  now: number,
): GameState {
  lastMotionPixels = []

  let s = state
  // We need to update hitCount on ALL enemies each frame (even ones not hit)
  // so build an updated enemy list.
  const updatedEnemies: Enemy[] = []

  for (const enemy of state.enemies) {
    // Spawn grace period — skip diff check entirely
    if (now - enemy.spawnedAt < SPAWN_GRACE_MS) {
      updatedEnemies.push(enemy)
      continue
    }

    const scaledHitbox = scaleHitbox(enemy.hitbox, displayW, displayH)
    const diffResult = computeFrameDiff(currentData, prevData, scaledHitbox, MOTION_W)

    // Collect motion pixels for debug overlay (sample a subset for performance)
    if (diffResult) {
      const sx = displayW / MOTION_W
      const sy = displayH / (MOTION_W * 9 / 16) // approximate displayH ratio
      lastMotionPixels.push({
        x: (scaledHitbox.x + scaledHitbox.w / 2) * sx,
        y: (scaledHitbox.y + scaledHitbox.h / 2) * sy,
      })
    }

    const newHitCount = diffResult ? enemy.hitCount + 1 : 0

    if (newHitCount < HIT_FRAMES_REQUIRED) {
      // Not enough consecutive frames — update counter, keep enemy
      updatedEnemies.push({ ...enemy, hitCount: newHitCount })
      continue
    }

    // Hit confirmed — apply consequences
    if (enemy.type === 'ghost') {
      s = addScore(s, 100)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
      // enemy removed — don't push to updatedEnemies
    } else if (enemy.type === 'bat') {
      s = addScore(s, 50)
      s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
    } else if (enemy.type === 'skull') {
      s = decrementLife(s)
      s = setFlash(s, now + 300)
      // skull removed
    } else {
      // unknown type — keep
      updatedEnemies.push({ ...enemy, hitCount: newHitCount })
    }
  }

  // Replace enemy list with the updated (surviving) enemies
  s = setEnemies(s, updatedEnemies)
  // Also apply any removes that happened above via the filter
  // (enemies not pushed to updatedEnemies are effectively removed)
  return s
}
