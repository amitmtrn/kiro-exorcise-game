/**
 * Hit resolution — frame differencing per enemy + game-state consequences.
 */

import type { GameState, Enemy } from './state'
import {
  addScore, decrementLife, addParticles, setFlash, setEnemies,
  incrementCombo, incrementBanished, setShake, addScoreLabels,
  SHAKE_FRAMES, SHAKE_COMBO_THRESHOLD, FRAME_MS,
} from './state'
import { computeFrameDiff, scaleHitbox, MOTION_W, MOTION_H } from '../webcam/diff'
import type { MotionMask } from '../webcam/diff'
import { spawnGhostPuff, spawnBatPuff, spawnScoreLabel } from './particles'
import {
  sfxGhostHit, sfxBatHit, sfxSkullHit,
  sfxBossHit, sfxBossDefeated, sfxCombo,
} from '../audio/sfx'

const SPAWN_GRACE_MS = 300
/** A hit flash below this many 60 Hz frames remaining is over (avoids a 2nd flash frame at 16 ms ticks). */
const FLASH_EPSILON = 0.25

/** Count a hit flash down by `dt` 60 Hz frames (pbt BUG-4). */
function decayFlash(frames: number, dt: number): number {
  const rest = frames - dt
  return rest > FLASH_EPSILON ? rest : 0
}
/** Consecutive *new camera frames* with motion in the hitbox needed to confirm a hit. */
const HIT_FRAMES_REQUIRED = 2

/**
 * Display-space coordinates of every sampled pixel that moved in the most recent
 * new camera frame. Fed by updateMotionPixels() every tick from the loop, read by
 * the motion buttons (all screens) and the debug overlay.
 */
export let lastMotionPixels: Array<{ x: number; y: number }> = []

/**
 * Publish the whole-frame motion mask in display space. On a duplicate camera
 * frame (mask.changed === false) the previous pixels are kept, so a held wave
 * over a motion button is not interrupted by the camera's lower frame rate.
 */
export function updateMotionPixels(mask: MotionMask, displayW: number, displayH: number): void {
  if (!mask.changed) return
  const sx = displayW / MOTION_W
  const sy = displayH / MOTION_H
  lastMotionPixels = mask.points.map((p) => ({ x: p.x * sx, y: p.y * sy }))
}

/**
 * Enemies banished during the most recent resolveHits call, each with
 * hitFlashFrames = 1. They are no longer in state; the renderer draws them in
 * solid white for exactly one frame (spooky-skin R4.2) before the puff shows.
 */
export let lastBanished: Enemy[] = []

/** Shake the screen when a scoring hit lands at streak ≥ 3 (spooky-skin R4.1). */
function shakeIfStrong(s: GameState): GameState {
  return s.streak >= SHAKE_COMBO_THRESHOLD ? setShake(s, SHAKE_FRAMES) : s
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
  frameIsNew = true,
  deltaMs: number = FRAME_MS,
): GameState {
  lastBanished = []

  // Nothing scores after death (pbt BUG-3).
  if (state.phase === 'gameover') return state

  const dt = deltaMs / FRAME_MS

  // Duplicate camera frame: the diff would be exactly zero everywhere, which
  // used to reset every enemy's 2-frame gate on every other tick for a 30 fps
  // webcam. Leave the gate counters alone and only let hit flashes expire.
  if (!frameIsNew) {
    return setEnemies(state, state.enemies.map((e) =>
      e.hitFlashFrames > 0 ? { ...e, hitFlashFrames: decayFlash(e.hitFlashFrames, dt) } : e,
    ))
  }

  let s = state
  const updatedEnemies: Enemy[] = []

  for (const raw of state.enemies) {
    // A white flash set last frame expires this frame unless re-triggered below.
    const enemy: Enemy = raw.hitFlashFrames > 0
      ? { ...raw, hitFlashFrames: decayFlash(raw.hitFlashFrames, dt) }
      : raw

    // The last life was lost earlier in this call: nobody else scores.
    if (s.phase === 'gameover') {
      updatedEnemies.push(enemy)
      continue
    }

    if (now - enemy.spawnedAt < SPAWN_GRACE_MS) {
      updatedEnemies.push(enemy)
      continue
    }

    const scaledHitbox = scaleHitbox(enemy.hitbox, displayW, displayH)
    const diffResult = computeFrameDiff(currentData, prevData, scaledHitbox, MOTION_W)

    const newHitCount = diffResult ? enemy.hitCount + 1 : 0

    if (newHitCount < HIT_FRAMES_REQUIRED) {
      updatedEnemies.push({ ...enemy, hitCount: newHitCount })
      continue
    }

    // ── Hit confirmed ─────────────────────────────────────────────────────────

    if (enemy.type === 'ghost' || enemy.type === 'lunger') {
      const pts = (enemy.type === 'ghost' ? 100 : 150) * s.combo
      s = scoreWithPop(s, enemy, pts)
      const tierBefore = s.combo
      s = incrementCombo(s)
      s = incrementBanished(s)
      s = shakeIfStrong(s)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
      lastBanished.push({ ...enemy, hitFlashFrames: 1 })
      try { sfxGhostHit(); if (s.combo > tierBefore) sfxCombo(s.combo) } catch { /* audio not ready */ }

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
