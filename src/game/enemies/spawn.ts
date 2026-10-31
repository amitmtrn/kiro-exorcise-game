/**
 * Spawn ticker — decrements spawn timers each tick and creates new enemies
 * when timers fire, respecting the cap and skull uniqueness rule.
 */

import type { GameState } from '../state'
import { setEnemies, setSpawnTimers } from '../state'
import { createGhost } from './ghost'
import { createBat } from './bat'
import { createSkull } from './skull'

export const MAX_ENEMIES = 6

/** Inclusive random interval in ms between `minMs` and `maxMs`. */
function nextInterval(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs)
}

export function tickSpawners(
  state: GameState,
  deltaMs: number,
  canvasW: number,
  canvasH: number,
): GameState {
  let { enemies } = state
  const timers = { ...state.spawnTimers }

  // ── Ghost ──────────────────────────────────────────────────────────────────
  timers.ghost -= deltaMs
  if (timers.ghost <= 0 && enemies.length < MAX_ENEMIES) {
    enemies = [...enemies, createGhost(canvasW, canvasH)]
    timers.ghost = nextInterval(2000, 4000)
  } else if (timers.ghost <= 0) {
    // Cap reached — reset timer and try again next tick
    timers.ghost = nextInterval(2000, 4000)
  }

  // ── Bat ────────────────────────────────────────────────────────────────────
  timers.bat -= deltaMs
  if (timers.bat <= 0 && enemies.length < MAX_ENEMIES) {
    enemies = [...enemies, createBat(canvasW, canvasH)]
    timers.bat = nextInterval(1000, 2000)
  } else if (timers.bat <= 0) {
    timers.bat = nextInterval(1000, 2000)
  }

  // ── Skull ──────────────────────────────────────────────────────────────────
  const skullActive = enemies.some((e) => e.type === 'skull')
  timers.skull -= deltaMs
  if (timers.skull <= 0 && enemies.length < MAX_ENEMIES && !skullActive) {
    enemies = [...enemies, createSkull(canvasW, canvasH)]
    timers.skull = nextInterval(8000, 12000)
  } else if (timers.skull <= 0) {
    timers.skull = nextInterval(8000, 12000)
  }

  let next = setSpawnTimers(state, timers)
  next = setEnemies(next, enemies)
  return next
}
