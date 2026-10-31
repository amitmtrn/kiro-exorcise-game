/**
 * Core game state — types, initial state factory, and pure reducer functions.
 * Nothing in this file touches the DOM or canvas.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Hitbox {
  x: number // top-left x
  y: number // top-left y
  w: number // width
  h: number // height
}

export type EnemyType = 'ghost' | 'bat' | 'skull'

export interface Enemy {
  id: string
  type: EnemyType
  x: number        // center x, canvas coords
  y: number        // center y, canvas coords
  targetX: number
  targetY: number
  speed: number    // px per frame at 60 fps
  sineOffset: number // phase for ghost wobble / bat zigzag
  hitbox: Hitbox   // axis-aligned, updated each move step
  spawnedAt: number  // performance.now() when created; used for spawn grace period
  hitCount: number   // consecutive frames where diff was true; used for 2-frame gate
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number    // 0–1
  decay: number    // alpha reduction per frame
  color: string
  radius: number
}

export type GamePhase = 'title' | 'playing' | 'gameover'

export interface SpawnTimers {
  ghost: number   // ms until next ghost spawn
  bat: number     // ms until next bat spawn
  skull: number   // ms until next skull spawn
}

export interface GameState {
  phase: GamePhase
  lives: number          // 0–3
  score: number
  roundTimeMs: number    // milliseconds remaining in the round
  enemies: Enemy[]
  particles: Particle[]
  spawnTimers: SpawnTimers
  flashEndTime: number   // performance.now() timestamp; 0 = no flash
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ROUND_DURATION_MS = 60_000
export const STARTING_LIVES = 3

// ─── Initial state ────────────────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    phase: 'playing',
    lives: STARTING_LIVES,
    score: 0,
    roundTimeMs: ROUND_DURATION_MS,
    enemies: [],
    particles: [],
    spawnTimers: {
      ghost: 2000,   // first ghost after 2 s
      bat: 1000,     // first bat after 1 s
      skull: 5000,   // first skull after 5 s (spec says 5 s head start)
    },
    flashEndTime: 0,
  }
}

// ─── Reducers (pure — return new state objects) ───────────────────────────────

/** Decrement lives by 1. Transitions to gameover if lives reach 0. */
export function decrementLife(state: GameState): GameState {
  const lives = Math.max(0, state.lives - 1)
  return {
    ...state,
    lives,
    phase: lives === 0 ? 'gameover' : state.phase,
  }
}

/** Add points to the score. */
export function addScore(state: GameState, points: number): GameState {
  return { ...state, score: state.score + points }
}

/**
 * Tick the round timer down by deltaMs.
 * Transitions to gameover and clears all enemies when time expires.
 */
export function tickTimer(state: GameState, deltaMs: number): GameState {
  const roundTimeMs = Math.max(0, state.roundTimeMs - deltaMs)
  if (roundTimeMs === 0) {
    return { ...state, roundTimeMs, phase: 'gameover', enemies: [] }
  }
  return { ...state, roundTimeMs }
}

/** Remove a single enemy by id. */
export function removeEnemy(state: GameState, id: string): GameState {
  return { ...state, enemies: state.enemies.filter((e) => e.id !== id) }
}

/** Append new particles to the active particle list. */
export function addParticles(state: GameState, particles: Particle[]): GameState {
  return { ...state, particles: [...state.particles, ...particles] }
}

/** Replace the entire enemy list (used by movement / spawn logic). */
export function setEnemies(state: GameState, enemies: Enemy[]): GameState {
  return { ...state, enemies }
}

/** Replace the entire particle list (used after ticking particles). */
export function setParticles(state: GameState, particles: Particle[]): GameState {
  return { ...state, particles }
}

/** Set flashEndTime (skull hit red flash). */
export function setFlash(state: GameState, flashEndTime: number): GameState {
  return { ...state, flashEndTime }
}

/** Replace spawn timers (used by spawn ticker). */
export function setSpawnTimers(state: GameState, spawnTimers: SpawnTimers): GameState {
  return { ...state, spawnTimers }
}
