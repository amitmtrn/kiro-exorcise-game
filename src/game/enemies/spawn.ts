/**
 * Spawn ticker — decrements spawn timers each tick and creates new enemies
 * respecting the stage config, enemy cap, and skull/boss uniqueness rules.
 */

import type { GameState } from '../state'
import { setEnemies, setSpawnTimers } from '../state'
import { STAGES } from '../stages'
import { createGhost } from './ghost'
import { createBat } from './bat'
import { createSkull } from './skull'
import { createLunger } from './lunger'
import { createPumpkin } from './pumpkin'

function nextInterval(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs)
}

/**
 * Next spawn timer after an expiry: a fresh randomised interval, shortened by
 * the overshoot (time past zero, ≤ 0 here) so the long-run spawn rate does not
 * depend on frame rate. Overshoot is capped at one interval (pbt BUG-5).
 */
function resetTimer(current: number, baseMs: number): number {
  const interval = nextInterval(baseMs * 0.8, baseMs * 1.3)
  return interval + Math.max(current, -interval)
}

export function tickSpawners(
  state: GameState,
  deltaMs: number,
  canvasW: number,
  canvasH: number,
): GameState {
  if (state.phase !== 'playing') return state

  const cfg = STAGES[state.stage - 1]
  const mix = cfg.enemyMix
  const mult = cfg.speedMultiplier
  const max = cfg.maxEnemies

  let { enemies } = state
  const timers = { ...state.spawnTimers }

  const skullActive = enemies.some((e) => e.type === 'skull' && !e.exiting)
  // Boss is handled separately by round.ts — don't spawn it here
  // Running count: several timers can expire on the same tick, so every spawn
  // below must see the enemies added earlier in this tick (pbt T4).
  let nonBossCount = enemies.filter((e) => e.type !== 'boss' && !e.exiting).length

  // Ghost
  timers.ghost -= deltaMs
  if (timers.ghost <= 0) {
    if (mix.ghost && nonBossCount < max) {
      enemies = [...enemies, createGhost(canvasW, canvasH, mult)]
      nonBossCount++
    }
    timers.ghost = resetTimer(timers.ghost, cfg.spawnIntervalMs.ghost)
  }

  // Bat
  timers.bat -= deltaMs
  if (timers.bat <= 0) {
    if (mix.bat && nonBossCount < max) {
      enemies = [...enemies, createBat(canvasW, canvasH, mult)]
      nonBossCount++
    }
    timers.bat = resetTimer(timers.bat, cfg.spawnIntervalMs.bat)
  }

  // Skull (max 1 non-exiting at a time; a leaving skull does not block)
  timers.skull -= deltaMs
  if (timers.skull <= 0) {
    if (mix.skull && nonBossCount < max && !skullActive) {
      enemies = [...enemies, createSkull(canvasW, canvasH, mult)]
      nonBossCount++
    }
    timers.skull = resetTimer(timers.skull, cfg.spawnIntervalMs.skull)
  }

  // Lunger
  timers.lunger -= deltaMs
  if (timers.lunger <= 0) {
    if (mix.lunger && nonBossCount < max) {
      enemies = [...enemies, createLunger(canvasW, canvasH, mult)]
      nonBossCount++
    }
    timers.lunger = resetTimer(timers.lunger, cfg.spawnIntervalMs.lunger)
  }

  // Pumpkin
  timers.pumpkin -= deltaMs
  if (timers.pumpkin <= 0) {
    if (mix.pumpkin && nonBossCount < max) {
      enemies = [...enemies, createPumpkin(canvasW, canvasH, mult)]
      nonBossCount++
    }
    timers.pumpkin = resetTimer(timers.pumpkin, cfg.spawnIntervalMs.pumpkin)
  }

  let next = setSpawnTimers(state, timers)
  next = setEnemies(next, enemies)
  return next
}

export const MAX_ENEMIES = 6 // kept for tests
