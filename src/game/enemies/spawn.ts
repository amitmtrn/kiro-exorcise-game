/**
 * Spawn ticker — decrements spawn timers each tick and creates new enemies
 * respecting the stage config, enemy cap, and skull/boss uniqueness rules.
 */

import type { GameState, Enemy } from '../state'
import { setEnemies, setSpawnTimers } from '../state'
import { STAGES } from '../stages'
import { createGhost } from './ghost'
import { createBat } from './bat'
import { createSkull } from './skull'
import { createLunger } from './lunger'
import { createPumpkin } from './pumpkin'
import { spawnWave } from './waveSpawn'
import { intensityAt, spawnRateFor, speedFactorFor, pickPath, BONUS_ROUND } from '../waves'
import type { WaveKind } from '../waves'
import type { WavePath } from '../paths'

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

/** Random swarm size (3–5); everything else spawns one at a time. */
function randomCount(path: WavePath): number {
  return path === 'swarm' ? 3 + Math.floor(Math.random() * 3) : 1
}

export function tickSpawners(
  state: GameState,
  deltaMs: number,
  canvasW: number,
  canvasH: number,
): GameState {
  if (state.phase !== 'playing') return state

  // The bonus round (waves R5) swaps in its own config: the `bat` slot spawns
  // candy, the `pumpkin` slot one-hit pumpkins, everything else is switched off.
  const bonus = state.bonus
  const stageCfg = STAGES[state.stage - 1]
  const cfg = bonus ? BONUS_ROUND : stageCfg
  const mix = cfg.enemyMix
  const max = cfg.maxEnemies
  const edges = bonus ? 'all' : stageCfg.spawnEdges
  const batKind: WaveKind = bonus ? 'candy' : 'bat'

  // Wave script (waves spec): the stage clock drives an intensity level that
  // scales the spawn timers and the speed of new enemies. No script (boss
  // stage) → the original flat spawner.
  const script = bonus ? BONUS_ROUND.script : stageCfg.waves
  const elapsed = Math.min(cfg.durationMs, Math.max(0, cfg.durationMs - state.roundTimeMs))
  const level = script ? intensityAt(script.intensity, elapsed / cfg.durationMs) : 0.5
  const rate = script ? spawnRateFor(level) : 1
  const mult = cfg.speedMultiplier * (script ? speedFactorFor(level) : 1)

  let { enemies } = state
  const timers = { ...state.spawnTimers }

  const skullActive = enemies.some((e) => e.type === 'skull' && !e.exiting)
  // Boss is handled separately by round.ts — don't spawn it here
  // Running count: several timers can expire on the same tick, so every spawn
  // below must see the enemies added earlier in this tick (pbt T4).
  let nonBossCount = enemies.filter((e) => e.type !== 'boss' && !e.exiting).length

  /** Spawn up to `count` path enemies, never beyond the cap (R3.4). */
  const addWave = (kind: WaveKind, path: WavePath, count: number, height?: number): void => {
    const n = Math.min(count, max - nonBossCount)
    if (n <= 0) return
    const made = spawnWave(kind, path, n, { W: canvasW, H: canvasH, speedMult: mult, edges, height, bonus })
    enemies = [...enemies, ...made]
    nonBossCount += made.length
  }

  /** Timer-driven spawn of one ghost / bat / pumpkin (or a bat swarm). */
  const addRandom = (kind: WaveKind, legacy: () => Enemy): void => {
    if (!script) {
      enemies = [...enemies, legacy()]
      nonBossCount++
      return
    }
    let path = pickPath(script.pathMix[kind], Math.random())
    if (path === 'swarm' && max - nonBossCount < 3) path = 'flyby'
    addWave(kind, path, randomCount(path))
  }

  // Ghost
  timers.ghost -= deltaMs * rate
  if (timers.ghost <= 0) {
    if (mix.ghost && nonBossCount < max) addRandom('ghost', () => createGhost(canvasW, canvasH, mult))
    timers.ghost = resetTimer(timers.ghost, cfg.spawnIntervalMs.ghost)
  }

  // Bat
  timers.bat -= deltaMs * rate
  if (timers.bat <= 0) {
    if (mix.bat && nonBossCount < max) addRandom(batKind, () => createBat(canvasW, canvasH, mult))
    timers.bat = resetTimer(timers.bat, cfg.spawnIntervalMs.bat)
  }

  // Skull (max 1 non-exiting at a time; a leaving skull does not block)
  timers.skull -= deltaMs * rate
  if (timers.skull <= 0) {
    if (mix.skull && nonBossCount < max && !skullActive) {
      enemies = [...enemies, createSkull(canvasW, canvasH, mult)]
      nonBossCount++
    }
    timers.skull = resetTimer(timers.skull, cfg.spawnIntervalMs.skull)
  }

  // Lunger
  timers.lunger -= deltaMs * rate
  if (timers.lunger <= 0) {
    if (mix.lunger && nonBossCount < max) {
      enemies = [...enemies, createLunger(canvasW, canvasH, mult)]
      nonBossCount++
    }
    timers.lunger = resetTimer(timers.lunger, cfg.spawnIntervalMs.lunger)
  }

  // Pumpkin
  timers.pumpkin -= deltaMs * rate
  if (timers.pumpkin <= 0) {
    if (mix.pumpkin && nonBossCount < max) addRandom('pumpkin', () => createPumpkin(canvasW, canvasH, mult))
    timers.pumpkin = resetTimer(timers.pumpkin, cfg.spawnIntervalMs.pumpkin)
  }

  // Scripted set pieces fire once, in order, as the stage clock passes their time.
  let waveIndex = state.waveIndex
  if (script) {
    while (waveIndex < script.events.length && script.events[waveIndex].atMs <= elapsed) {
      const ev = script.events[waveIndex]
      const enabled = ev.kind === 'ghost' ? mix.ghost : ev.kind === 'bat' ? mix.bat : ev.kind === 'pumpkin' ? mix.pumpkin : bonus
      if (enabled) addWave(ev.kind, ev.path, ev.count, ev.height)
      waveIndex++
    }
  }

  let next = setSpawnTimers(state, timers)
  next = setEnemies(next, enemies)
  return waveIndex === next.waveIndex ? next : { ...next, waveIndex }
}

export const MAX_ENEMIES = 6 // kept for tests
