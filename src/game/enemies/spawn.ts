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
  const nonBossCount = enemies.filter((e) => e.type !== 'boss' && !e.exiting).length

  // Ghost
  timers.ghost -= deltaMs
  if (timers.ghost <= 0) {
    if (mix.ghost && nonBossCount < max) {
      enemies = [...enemies, createGhost(canvasW, canvasH, mult)]
    }
    timers.ghost = nextInterval(cfg.spawnIntervalMs.ghost * 0.8, cfg.spawnIntervalMs.ghost * 1.3)
  }

  // Bat
  timers.bat -= deltaMs
  if (timers.bat <= 0) {
    if (mix.bat && nonBossCount < max) {
      enemies = [...enemies, createBat(canvasW, canvasH, mult)]
    }
    timers.bat = nextInterval(cfg.spawnIntervalMs.bat * 0.8, cfg.spawnIntervalMs.bat * 1.3)
  }

  // Skull (max 1 non-exiting at a time; a leaving skull does not block)
  timers.skull -= deltaMs
  if (timers.skull <= 0) {
    if (mix.skull && nonBossCount < max && !skullActive) {
      enemies = [...enemies, createSkull(canvasW, canvasH, mult)]
    }
    timers.skull = nextInterval(cfg.spawnIntervalMs.skull * 0.8, cfg.spawnIntervalMs.skull * 1.3)
  }

  // Lunger
  timers.lunger -= deltaMs
  if (timers.lunger <= 0) {
    if (mix.lunger && nonBossCount < max) {
      enemies = [...enemies, createLunger(canvasW, canvasH, mult)]
    }
    timers.lunger = nextInterval(cfg.spawnIntervalMs.lunger * 0.8, cfg.spawnIntervalMs.lunger * 1.3)
  }

  // Pumpkin
  timers.pumpkin -= deltaMs
  if (timers.pumpkin <= 0) {
    if (mix.pumpkin && nonBossCount < max) {
      enemies = [...enemies, createPumpkin(canvasW, canvasH, mult)]
    }
    timers.pumpkin = nextInterval(cfg.spawnIntervalMs.pumpkin * 0.8, cfg.spawnIntervalMs.pumpkin * 1.3)
  }

  let next = setSpawnTimers(state, timers)
  next = setEnemies(next, enemies)
  return next
}

export const MAX_ENEMIES = 6 // kept for tests
