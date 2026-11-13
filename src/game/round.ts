/**
 * Round / phase machine — handles all stage transitions.
 * Called once per tick from the game loop instead of inline phase checks.
 */

import type { GameState } from './state'
import {
  createInitialState,
  setEnemies,
  STAGE_TITLE_DURATION_MS,
  SUMMARY_AUTO_ADVANCE_MS,
  saveHighScore,
} from './state'
import { STAGES } from './stages'
import { BONUS_ROUND } from './waves'
import { createBoss } from './enemies/boss'

export function tickRound(
  state: GameState,
  deltaMs: number,
  canvasW: number,
  canvasH: number,
): GameState {
  switch (state.phase) {
    case 'start':
      // Stays in start until motion button triggers startGame()
      return state

    case 'stageTitle': {
      const stageTitleMs = Math.max(0, state.stageTitleMs - deltaMs)
      if (stageTitleMs === 0) {
        // Start playing — reset timers from stage config
        // The bonus round brings its own duration and spawn slots (waves R5).
        const cfg = state.bonus ? BONUS_ROUND : STAGES[state.stage - 1]
        return {
          ...state,
          stageTitleMs: 0,
          hitStopMs: 0,
          phase: 'playing',
          roundTimeMs: cfg.durationMs,
          enemies: [],
          spawnTimers: {
            ghost: cfg.spawnIntervalMs.ghost,
            bat: cfg.spawnIntervalMs.bat,
            skull: cfg.spawnIntervalMs.skull,
            lunger: cfg.spawnIntervalMs.lunger,
            pumpkin: cfg.spawnIntervalMs.pumpkin,
          },
          stageBanished: 0,
          stageMissed: 0,
          bossActive: false,
          waveIndex: 0,
        }
      }
      return { ...state, stageTitleMs }
    }

    case 'playing': {
      // Stage 5 boss: spawn boss when time drops to last 55 s and boss not yet active
      if (state.stage === 5 && !state.bossActive && state.roundTimeMs <= state.roundTimeMs) {
        // Actually spawn boss on first tick of playing (stage 5 only has boss + helper ghosts)
      }
      // Timer handled by tickTimer in loop; this just passes through
      return state
    }

    case 'summary': {
      // Save high score whenever we reach summary
      saveHighScore(state.highScore)
      const summaryShownMs = state.summaryShownMs + deltaMs
      if (summaryShownMs >= SUMMARY_AUTO_ADVANCE_MS) {
        return advanceToNextStage(state, canvasW, canvasH)
      }
      return { ...state, summaryShownMs }
    }

    case 'victory':
    case 'gameover':
      saveHighScore(state.highScore)
      return state

    default:
      return state
  }
}

/**
 * Transition from summary → next stage title (via the bonus round when the stage
 * has one), or → victory after the final stage (never loops).
 */
export function advanceToNextStage(
  state: GameState,
  _canvasW: number,
  _canvasH: number,
): GameState {
  if (state.stage >= STAGES.length) {
    return { ...state, phase: 'victory', enemies: [] }
  }
  // Waves R5: a stage may be followed by a bonus round (same stage index, `bonus` set).
  if (!state.bonus && STAGES[state.stage - 1].bonusAfter) {
    return {
      ...createInitialState(state.stage),
      lives: state.lives,
      score: state.score,
      highScore: state.highScore,
      phase: 'stageTitle',
      stageTitleMs: STAGE_TITLE_DURATION_MS,
      bonus: true,
    }
  }
  const nextStage = state.stage + 1
  return {
    ...createInitialState(nextStage),
    lives: state.lives,          // carry lives across stages
    score: state.score,          // carry score
    highScore: state.highScore,  // carry high score
    phase: 'stageTitle',
    stageTitleMs: STAGE_TITLE_DURATION_MS,
  }
}

/** Called when player triggers motion start on the start screen. */
export function startGame(state: GameState): GameState {
  return {
    ...state,
    phase: 'stageTitle',
    stageTitleMs: STAGE_TITLE_DURATION_MS,
    stage: 1,
  }
}

/** Called when player chooses "Retry Stage" on game over. */
export function retryStage(state: GameState): GameState {
  return {
    ...createInitialState(state.stage),
    highScore: state.highScore,
    phase: 'stageTitle',
    stageTitleMs: STAGE_TITLE_DURATION_MS,
  }
}

/** Spawn boss for stage 5. Called from loop when stage=5 and bossActive=false. */
export function spawnBoss(state: GameState, canvasW: number, canvasH: number): GameState {
  const boss = createBoss(canvasW, canvasH)
  return {
    ...setEnemies(state, [...state.enemies, boss]),
    bossActive: true,
  }
}
