/**
 * Hit resolution — frame differencing per enemy + game-state consequences.
 */

import type { GameState, Enemy } from './state'
import {
  addScore, decrementLife, addParticles, setFlash, setEnemies,
  incrementCombo, incrementBanished,
} from './state'
import { computeFrameDiff, scaleHitbox, MOTION_W } from '../webcam/diff'
import { spawnGhostPuff, spawnBatPuff } from './particles'
import {
  sfxGhostHit, sfxBatHit, sfxSkullHit,
  sfxBossHit, sfxBossDefeated, sfxCombo,
} from '../audio/sfx'

const SPAWN_GRACE_MS = 300
const HIT_FRAMES_REQUIRED = 2

export let lastMotionPixels: Array<{ x: number; y: number }> = []

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
  const updatedEnemies: Enemy[] = []

  for (const enemy of state.enemies) {
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
      s = addScore(s, pts)
      s = incrementCombo(s)
      s = incrementBanished(s)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
      try { sfxGhostHit(); sfxCombo(s.combo) } catch { /* audio not ready */ }

    } else if (enemy.type === 'bat') {
      s = addScore(s, 50 * s.combo)
      s = incrementCombo(s)
      s = incrementBanished(s)
      s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
      try { sfxBatHit() } catch { /* audio not ready */ }

    } else if (enemy.type === 'pumpkin') {
      const newHitsReceived = enemy.hitsReceived + 1
      if (newHitsReceived >= enemy.hitsNeeded) {
        s = addScore(s, 200 * s.combo)
        s = incrementCombo(s)
        s = incrementBanished(s)
        s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
        try { sfxGhostHit() } catch { /* audio not ready */ }
      } else {
        try { sfxBatHit() } catch { /* audio not ready */ }
        updatedEnemies.push({ ...enemy, hitsReceived: newHitsReceived, hitCount: 0 })
      }

    } else if (enemy.type === 'skull') {
      s = decrementLife(s)
      s = setFlash(s, now + 300)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
      try { sfxSkullHit() } catch { /* audio not ready */ }

    } else if (enemy.type === 'boss') {
      const newBossHits = enemy.bossHitsReceived + 1
      if (newBossHits >= enemy.hitsNeeded) {
        s = addScore(s, 1000 * s.combo)
        s = incrementBanished(s)
        s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
        s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
        s = setFlash(s, now + 400)
        try { sfxBossDefeated() } catch { /* audio not ready */ }
      } else {
        updatedEnemies.push({ ...enemy, bossHitsReceived: newBossHits, hitCount: 0 })
        try { sfxBossHit() } catch { /* audio not ready */ }
      }

    } else {
      updatedEnemies.push({ ...enemy, hitCount: newHitCount })
    }
  }

  return setEnemies(s, updatedEnemies)
}
