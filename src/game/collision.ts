/**
 * Hit resolution — frame differencing per enemy + game-state consequences.
 */

import type { GameState, Enemy } from './state'
import {
  addScore, decrementLife, addParticles, setFlash, setEnemies,
  incrementCombo, incrementBanished, setShake, addScoreLabels,
  SHAKE_FRAMES, SHAKE_COMBO_THRESHOLD,
} from './state'
import { computeFrameDiff, scaleHitbox, MOTION_W } from '../webcam/diff'
import { spawnGhostPuff, spawnBatPuff, spawnScoreLabel } from './particles'
import {
  sfxGhostHit, sfxBatHit, sfxSkullHit,
  sfxBossHit, sfxBossDefeated, sfxCombo,
} from '../audio/sfx'

const SPAWN_GRACE_MS = 300
const HIT_FRAMES_REQUIRED = 2

export let lastMotionPixels: Array<{ x: number; y: number }> = []

/**
 * Enemies banished during the most recent resolveHits call, each with
 * hitFlashFrames = 1. They are no longer in state; the renderer draws them in
 * solid white for exactly one frame (spooky-skin R4.2) before the puff shows.
 */
export let lastBanished: Enemy[] = []

/** Shake the screen when a scoring hit lands at combo ≥ 3 (spooky-skin R4.1). */
function shakeIfStrong(s: GameState): GameState {
  return s.combo >= SHAKE_COMBO_THRESHOLD ? setShake(s, SHAKE_FRAMES) : s
}

/** Award points and float a "+N" label up from the enemy (spooky-skin R5.2). */
function scoreWithPop(s: GameState, enemy: Enemy, pts: number): GameState {
  s = addScore(s, pts)
  return addScoreLabels(s, [spawnScoreLabel(enemy.x, enemy.y, pts)])
}

export function resolveHits(
  state: GameState,
  currentData: ImageData,
  prevData: ImageData,
  displayW: number,
  displayH: number,
  now: number,
): GameState {
  lastMotionPixels = []
  lastBanished = []

  let s = state
  const updatedEnemies: Enemy[] = []

  for (const raw of state.enemies) {
    // A white flash set last frame expires this frame unless re-triggered below.
    const enemy: Enemy = raw.hitFlashFrames > 0
      ? { ...raw, hitFlashFrames: raw.hitFlashFrames - 1 }
      : raw

    if (now - enemy.spawnedAt < SPAWN_GRACE_MS) {
      updatedEnemies.push(enemy)
      continue
    }

    const scaledHitbox = scaleHitbox(enemy.hitbox, displayW, displayH)
    const diffResult = computeFrameDiff(currentData, prevData, scaledHitbox, MOTION_W)

    if (diffResult) {
      lastMotionPixels.push({
        x: (scaledHitbox.x + scaledHitbox.w / 2) * (displayW / MOTION_W),
        y: (scaledHitbox.y + scaledHitbox.h / 2) * (displayH / MOTION_W),
      })
    }

    const newHitCount = diffResult ? enemy.hitCount + 1 : 0

    if (newHitCount < HIT_FRAMES_REQUIRED) {
      updatedEnemies.push({ ...enemy, hitCount: newHitCount })
      continue
    }

    // ── Hit confirmed ─────────────────────────────────────────────────────────

    if (enemy.type === 'ghost' || enemy.type === 'lunger') {
      const pts = (enemy.type === 'ghost' ? 100 : 150) * s.combo
      s = scoreWithPop(s, enemy, pts)
      s = incrementCombo(s)
      s = incrementBanished(s)
      s = shakeIfStrong(s)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
      lastBanished.push({ ...enemy, hitFlashFrames: 1 })
      try { sfxGhostHit(); sfxCombo(s.combo) } catch { /* audio not ready */ }

    } else if (enemy.type === 'bat') {
      s = scoreWithPop(s, enemy, 50 * s.combo)
      s = incrementCombo(s)
      s = incrementBanished(s)
      s = shakeIfStrong(s)
      s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
      lastBanished.push({ ...enemy, hitFlashFrames: 1 })
      try { sfxBatHit() } catch { /* audio not ready */ }

    } else if (enemy.type === 'pumpkin') {
      const newHitsReceived = enemy.hitsReceived + 1
      if (newHitsReceived >= enemy.hitsNeeded) {
        s = scoreWithPop(s, enemy, 200 * s.combo)
        s = incrementCombo(s)
        s = incrementBanished(s)
        s = shakeIfStrong(s)
        s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
        lastBanished.push({ ...enemy, hitFlashFrames: 1 })
        try { sfxGhostHit() } catch { /* audio not ready */ }
      } else {
        try { sfxBatHit() } catch { /* audio not ready */ }
        updatedEnemies.push({ ...enemy, hitsReceived: newHitsReceived, hitCount: 0, hitFlashFrames: 1 })
      }

    } else if (enemy.type === 'skull') {
      s = decrementLife(s)
      s = setFlash(s, now + 300)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
      lastBanished.push({ ...enemy, hitFlashFrames: 1 })
      try { sfxSkullHit() } catch { /* audio not ready */ }

    } else if (enemy.type === 'boss') {
      const newBossHits = enemy.bossHitsReceived + 1
      if (newBossHits >= enemy.hitsNeeded) {
        s = scoreWithPop(s, enemy, 1000 * s.combo)
        s = incrementBanished(s)
        s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
        s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
        s = setFlash(s, now + 400)
        s = setShake(s, SHAKE_FRAMES * 2) // boss defeat always rocks the screen
        lastBanished.push({ ...enemy, hitFlashFrames: 1 })
        try { sfxBossDefeated() } catch { /* audio not ready */ }
      } else {
        updatedEnemies.push({ ...enemy, bossHitsReceived: newBossHits, hitCount: 0, hitFlashFrames: 1 })
        try { sfxBossHit() } catch { /* audio not ready */ }
      }

    } else {
      updatedEnemies.push({ ...enemy, hitCount: newHitCount })
    }
  }

  return setEnemies(s, updatedEnemies)
}
