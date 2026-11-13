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

export type EnemyType = 'ghost' | 'bat' | 'skull' | 'lunger' | 'pumpkin' | 'boss'

export type MovePhase = 'approach' | 'windup' | 'lunge'

export interface Enemy {
  id: string
  type: EnemyType
  x: number          // center x, canvas coords
  y: number          // center y, canvas coords
  targetX: number
  targetY: number
  speed: number      // canvas heights per second (px/s = speed × canvasH)
  sineOffset: number // phase for ghost wobble / bat zigzag
  hitbox: Hitbox     // axis-aligned, updated each move step
  spawnedAt: number  // performance.now() when created; used for spawn grace period
  hitCount: number   // consecutive frames where diff was true; 2-frame gate
  // Lunger-specific
  movePhase: MovePhase
  phaseTimer: number // ms remaining in current movePhase (windup)
  // Pumpkin-specific
  hitsReceived: number
  hitsNeeded: number
  // Boss-specific
  bossHitsReceived: number
  // Skull-specific (feel-fix R2)
  onScreenMs: number // time the centre has been inside the canvas
  exiting: boolean   // skull is leaving the screen
  // Spooky-skin R4.2 — frames left to render this enemy in solid white
  hitFlashFrames: number
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

/** Spooky-skin R5.2 — floating "+N" label that drifts up and fades after a hit. */
export interface ScoreLabel {
  x: number
  y: number
  text: string
  alpha: number    // 0–1
  vy: number       // px per frame (negative = upward)
}

export type GamePhase = 'start' | 'stageTitle' | 'playing' | 'summary' | 'gameover'

export interface SpawnTimers {
  ghost: number
  bat: number
  skull: number
  lunger: number
  pumpkin: number
}

export interface GameState {
  phase: GamePhase
  lives: number
  score: number
  roundTimeMs: number
  enemies: Enemy[]
  particles: Particle[]
  scoreLabels: ScoreLabel[]
  spawnTimers: SpawnTimers
  flashEndTime: number
  // Stage tracking
  stage: number           // 1–5
  stageTitleMs: number    // countdown for title card (3 s)
  streak: number          // consecutive banishes since the last reset
  combo: number           // score multiplier derived from streak (x1–x4)
  bestCombo: number       // best combo this stage
  stageBanished: number   // enemies banished this stage
  stageMissed: number     // enemies that reached center this stage
  highScore: number       // all-time high score from localStorage
  summaryShownMs: number  // how long summary has been shown
  bossActive: boolean     // stage 5 boss spawned
  shakeFrames: number     // spooky-skin R4.1 — frames of screen shake remaining
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ROUND_DURATION_MS = 60_000
export const STARTING_LIVES = 3
export const STAGE_TITLE_DURATION_MS = 3_000
export const SUMMARY_AUTO_ADVANCE_MS = 5_000

// Spooky-skin R4.1 — screen shake fires on a scoring hit at streak ≥ 3, ±4 px for 3 frames
/** One 60 Hz frame in ms — the unit of the frame-counted effects (shake, flash, particles). */
export const FRAME_MS = 1000 / 60

export const SHAKE_FRAMES = 3
export const SHAKE_COMBO_THRESHOLD = 3
export const SHAKE_AMPLITUDE_PX = 4

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function makeEnemy(partial: Partial<Enemy> & Pick<Enemy, 'id' | 'type' | 'x' | 'y' | 'targetX' | 'targetY' | 'speed' | 'hitbox'>): Enemy {
  return {
    sineOffset: 0,
    spawnedAt: 0,
    hitCount: 0,
    movePhase: 'approach',
    phaseTimer: 0,
    hitsReceived: 0,
    hitsNeeded: 1,
    bossHitsReceived: 0,
    hitFlashFrames: 0,
    onScreenMs: 0,
    exiting: false,
    ...partial,
  }
}

// ─── Initial state ────────────────────────────────────────────────────────────

export function loadHighScore(): number {
  try {
    return parseInt(localStorage.getItem('exorcise-highscore') ?? '0', 10) || 0
  } catch {
    return 0
  }
}

export function saveHighScore(score: number): void {
  try {
    localStorage.setItem('exorcise-highscore', String(score))
  } catch { /* ignore */ }
}

export function createInitialState(stage = 1): GameState {
  return {
    phase: 'start',
    lives: STARTING_LIVES,
    score: 0,
    roundTimeMs: ROUND_DURATION_MS,
    enemies: [],
    particles: [],
    scoreLabels: [],
    spawnTimers: {
      ghost: 2000,
      bat: 1000,
      skull: 8000,
      lunger: 4000,
      pumpkin: 5000,
    },
    flashEndTime: 0,
    stage,
    stageTitleMs: STAGE_TITLE_DURATION_MS,
    streak: 0,
    combo: 1,
    bestCombo: 1,
    stageBanished: 0,
    stageMissed: 0,
    highScore: loadHighScore(),
    summaryShownMs: 0,
    bossActive: false,
    shakeFrames: 0,
  }
}

// ─── Reducers ─────────────────────────────────────────────────────────────────

export function decrementLife(state: GameState): GameState {
  const lives = Math.max(0, state.lives - 1)
  const dead = lives === 0
  return {
    ...state,
    lives,
    phase: dead ? 'gameover' : state.phase,
    // Hit flashes never outlive the game (nothing decays them after death).
    enemies: dead && state.enemies.some((e) => e.hitFlashFrames > 0)
      ? state.enemies.map((e) => (e.hitFlashFrames > 0 ? { ...e, hitFlashFrames: 0 } : e))
      : state.enemies,
  }
}

export function addScore(state: GameState, points: number): GameState {
  const newScore = state.score + points
  const highScore = newScore > state.highScore ? newScore : state.highScore
  return { ...state, score: newScore, highScore }
}

export function tickTimer(state: GameState, deltaMs: number): GameState {
  const roundTimeMs = Math.max(0, state.roundTimeMs - deltaMs)
  if (roundTimeMs === 0 && state.phase === 'playing') {
    return { ...state, roundTimeMs, phase: 'summary', enemies: [] }
  }
  return { ...state, roundTimeMs }
}

export function removeEnemy(state: GameState, id: string): GameState {
  return { ...state, enemies: state.enemies.filter((e) => e.id !== id) }
}

export function addParticles(state: GameState, particles: Particle[]): GameState {
  return { ...state, particles: [...state.particles, ...particles] }
}

export function setEnemies(state: GameState, enemies: Enemy[]): GameState {
  return { ...state, enemies }
}

export function setParticles(state: GameState, particles: Particle[]): GameState {
  return { ...state, particles }
}

export function addScoreLabels(state: GameState, labels: ScoreLabel[]): GameState {
  return { ...state, scoreLabels: [...state.scoreLabels, ...labels] }
}

export function setScoreLabels(state: GameState, scoreLabels: ScoreLabel[]): GameState {
  return { ...state, scoreLabels }
}

export function setFlash(state: GameState, flashEndTime: number): GameState {
  return { ...state, flashEndTime }
}

export function setSpawnTimers(state: GameState, spawnTimers: SpawnTimers): GameState {
  return { ...state, spawnTimers }
}

/** Stages R4.1 — streak thresholds, highest first. */
export const COMBO_TIERS: ReadonlyArray<{ streak: number; mult: number }> = [
  { streak: 10, mult: 4 },
  { streak: 6, mult: 3 },
  { streak: 3, mult: 2 },
]

/** Score multiplier for a given streak of consecutive banishes (x1–x4). */
export function comboForStreak(streak: number): number {
  for (const tier of COMBO_TIERS) if (streak >= tier.streak) return tier.mult
  return 1
}

export function incrementCombo(state: GameState): GameState {
  const streak = state.streak + 1
  const combo = comboForStreak(streak)
  const bestCombo = combo > state.bestCombo ? combo : state.bestCombo
  return { ...state, streak, combo, bestCombo }
}

export function resetCombo(state: GameState): GameState {
  return { ...state, streak: 0, combo: 1 }
}

export function incrementBanished(state: GameState): GameState {
  return { ...state, stageBanished: state.stageBanished + 1 }
}

export function incrementMissed(state: GameState): GameState {
  return { ...state, stageMissed: state.stageMissed + 1 }
}

// ─── Screen shake (spooky-skin R4.1) ──────────────────────────────────────────

export function setShake(state: GameState, frames: number): GameState {
  return { ...state, shakeFrames: Math.max(0, frames) }
}

/** Counts the shake down by `deltaMs` (one 60 Hz frame by default); call once per tick before rendering. */
export function tickShake(state: GameState, deltaMs: number = FRAME_MS): GameState {
  if (state.shakeFrames === 0) return state
  const left = state.shakeFrames - deltaMs / FRAME_MS
  // Snap float residue to 0 (same epsilon idea as the hit flash).
  return { ...state, shakeFrames: left < 0.05 ? 0 : left }
}
