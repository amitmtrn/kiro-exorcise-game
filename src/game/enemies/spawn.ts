/**
 * Spawn ticker — decrements spawn timers each tick and creates new enemies
 * respecting the stage config, enemy cap, and skull/boss uniqueness rules.
 */

import type { GameState, Enemy } from '../state'
import { setEnemies, setSpawnTimers } from '../state'
import { STAGES } from '../stages'
import { createSkull } from './skull'
import { createLunger } from './lunger'
import { spawnWave } from './waveSpawn'
import { spawnVariant, skullClearancePx } from './variantSpawn'
import { withTip, VARIANT_DEFER_MAX_MS } from '../finale'
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
  // stage) → no random spawns at all; the boss spawns its own minions.
  const script = bonus ? BONUS_ROUND.script : stageCfg.waves
  const elapsed = Math.min(cfg.durationMs, Math.max(0, cfg.durationMs - state.roundTimeMs))
  const level = script ? intensityAt(script.intensity, elapsed / cfg.durationMs) : 0.5
  const rate = script ? spawnRateFor(level) : 1
  const mult = cfg.speedMultiplier * (script ? speedFactorFor(level) : 1)

  // Bonus round: *random candy* leaves one slot free so bonus pumpkins and
  // scripted events are never starved by candy the player has not cleared.
  // Random pumpkins and scripted events may use the last slot.
  const candyReserve = bonus ? 1 : 0

  let { enemies } = state
  const timers = { ...state.spawnTimers }

  const skullActive = enemies.some((e) => e.type === 'skull' && !e.exiting)
  // Boss is handled separately by round.ts — don't spawn it here
  // Running count: several timers can expire on the same tick, so every spawn
  // below must see the enemies added earlier in this tick (pbt T4).
  let nonBossCount = enemies.filter((e) => e.type !== 'boss' && !e.exiting).length

  /** Spawn up to `count` path enemies, never beyond `cap` (default: the stage cap, R3.4). */
  const addWave = (kind: WaveKind, path: WavePath, count: number, height?: number, cap = max): void => {
    const n = Math.min(count, cap - nonBossCount)
    if (n <= 0) return
    const made = spawnWave(kind, path, n, { W: canvasW, H: canvasH, speedMult: mult, edges, height, bonus })
    enemies = [...enemies, ...made]
    nonBossCount += made.length
  }

  /** Timer-driven spawn of one ghost / bat / pumpkin / candy (or a swarm). Random candy stops one short of the cap. */
  const addRandom = (kind: WaveKind): void => {
    // No script (boss stage): the boss spawns its own minions, nothing random here.
    if (!script) return
    const cap = kind === 'candy' ? max - candyReserve : max
    let path = pickPath(script.pathMix[kind], Math.random())
    if (path === 'swarm' && cap - nonBossCount < 3) path = 'flyby'
    addWave(kind, path, randomCount(path), undefined, cap)
  }

  // Scripted set pieces fire once, in order, as the stage clock passes their
  // time. They run before the random timers so ambient spawns cannot eat their
  // slots. An event that does not fit (a swarm needs ≥ 3 free slots, anything
  // else ≥ 1) waits for room instead of being lost; later events queue behind it.
  let waveIndex = state.waveIndex
  if (script) {
    while (waveIndex < script.events.length && script.events[waveIndex].atMs <= elapsed) {
      const ev = script.events[waveIndex]
      const enabled = ev.kind === 'ghost' ? mix.ghost : ev.kind === 'bat' ? mix.bat : ev.kind === 'pumpkin' ? mix.pumpkin : bonus
      if (enabled) {
        const need = ev.path === 'swarm' ? Math.min(3, ev.count) : 1
        if (max - nonBossCount < need) break
        addWave(ev.kind, ev.path, ev.count, ev.height)
      }
      waveIndex++
    }
  }

  // New ghosts (more-content R5.2): scripted spawns of the stage, in order. A wisp pair needs two free
  // slots; an event that cannot fit within VARIANT_DEFER_MAX_MS of its time is dropped, so nothing new
  // arrives late in the stage. A spawn with no safe edge point waits for the next tick.
  let next0 = state
  let variantIndex = state.variantIndex
  let variantDone = state.variantDone
  const vEvents = bonus ? undefined : stageCfg.variantEvents
  if (vEvents) {
    // A due event that cannot fit (no free slots, no safe edge point) is skipped for now and retried on
    // later ticks; it never holds back the other due events, and is dropped after VARIANT_DEFER_MAX_MS.
    for (let i = variantIndex; i < vEvents.length && vEvents[i].atMs <= elapsed; i++) {
      if (variantDone.includes(i)) continue
      const ev = vEvents[i]
      if (elapsed - ev.atMs > VARIANT_DEFER_MAX_MS) { variantDone = [...variantDone, i]; continue }
      const need = ev.kind === 'wisp' ? 2 : 1
      if (max - nonBossCount < need) continue
      const made = spawnVariant(ev.kind, canvasW, canvasH, enemies.filter((e) => e.type === 'skull'))
      if (!made) continue
      enemies = [...enemies, ...made]
      nonBossCount += made.length
      next0 = withTip(next0, ev.kind, made[0].x, made[0].y, canvasW, canvasH)
      variantDone = [...variantDone, i]
    }
    while (variantDone.includes(variantIndex)) variantIndex++
    variantDone = variantDone.filter((i) => i >= variantIndex)
  }
  // The skull stays away from the finale boss entrance (R5.2).
  const skullQuiet = !bonus && !!stageCfg.finale && elapsed >= stageCfg.finale.bossAtMs - stageCfg.finale.skullQuietMs

  // Ghost
  timers.ghost -= deltaMs * rate
  if (timers.ghost <= 0) {
    if (mix.ghost && nonBossCount < max) addRandom('ghost')
    timers.ghost = resetTimer(timers.ghost, cfg.spawnIntervalMs.ghost)
  }

  // Bat
  timers.bat -= deltaMs * rate
  if (timers.bat <= 0) {
    if (mix.bat && nonBossCount < (batKind === 'candy' ? max - candyReserve : max)) addRandom(batKind)
    timers.bat = resetTimer(timers.bat, cfg.spawnIntervalMs.bat)
  }

  // Skull (max 1 non-exiting at a time; a leaving skull does not block)
  timers.skull -= deltaMs * rate
  if (timers.skull <= 0) {
    let skullWaits = false
    if (mix.skull && !skullQuiet && nonBossCount < max && !skullActive) {
      // Keep clear of new ghosts still near their spawn edge (R1.6, both directions); retry next tick if no safe point.
      const newGhosts = enemies.filter((e) => e.type === 'blink' || e.type === 'wisp' || e.type === 'mirror')
      const clear = skullClearancePx()
      let skull: Enemy | null = null
      for (let i = 0; i < 6 && !skull; i++) {
        const c = createSkull(canvasW, canvasH, mult)
        if (newGhosts.every((g) => Math.hypot(g.x - c.x, g.y - c.y) >= clear)) skull = c
      }
      if (skull) { enemies = [...enemies, skull]; nonBossCount++ } else skullWaits = true
    }
    if (!skullWaits) timers.skull = resetTimer(timers.skull, cfg.spawnIntervalMs.skull)
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
    if (mix.pumpkin && nonBossCount < max) addRandom('pumpkin')
    timers.pumpkin = resetTimer(timers.pumpkin, cfg.spawnIntervalMs.pumpkin)
  }

  let next = setSpawnTimers(next0, timers)
  next = setEnemies(next, enemies)
  if (variantIndex !== next.variantIndex || variantDone !== state.variantDone) next = { ...next, variantIndex, variantDone }
  return waveIndex === next.waveIndex ? next : { ...next, waveIndex }
}

export const MAX_ENEMIES = 6 // kept for tests
