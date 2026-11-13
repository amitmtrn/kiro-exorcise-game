/**
 * Run-wide statistics for the Exorcist Card (exorcist-card R2.2, R3.3).
 *
 * GameState only tracks per-stage banish counts and resets most things on a
 * stage change, so this tracker watches the state once per tick and keeps the
 * run totals. Pure: no DOM, no canvas, no timers.
 */

import type { GamePhase, GameState } from './state'

export type MomentKind = 'boss' | 'combo' | 'end'

/** A fun moment worth a snapshot; a higher rank beats a lower one. */
export interface Moment {
  kind: MomentKind
  rank: number
}

export interface RunStats {
  /** Banishes of finished stages (added when `stageBanished` resets). */
  banked: number
  lastStageBanished: number
  /** Best combo multiplier (x1–x4) over the whole run. */
  bestCombo: number
  /** Highest stage reached (1–5). */
  stage: number
  /** Phase seen on the previous observation, to detect transitions. */
  phase: GamePhase | null
}

export type ObservedState = Pick<GameState, 'phase' | 'stage' | 'stageBanished' | 'combo'> & {
  /** Per-stage best combo; catches a tier gained and lost within one tick. */
  bestCombo?: number
}

export const BOSS_MOMENT_RANK = 100
export const END_MOMENT_RANK = 0

export function createRunStats(): RunStats {
  return { banked: 0, lastStageBanished: 0, bestCombo: 1, stage: 1, phase: null }
}

/** Enemies banished over the whole run. */
export function totalBanished(stats: RunStats): number {
  return stats.banked + stats.lastStageBanished
}

/** Snapshot rank of a moment: boss 100, combo tier × 10 (20–40), end 0. */
export function momentRank(kind: MomentKind, combo = 1): number {
  if (kind === 'boss') return BOSS_MOMENT_RANK
  if (kind === 'combo') return Math.max(1, combo) * 10
  return END_MOMENT_RANK
}

/**
 * Folds one tick's state into the run stats. Returns the new stats plus the
 * moment (if any) that this observation created.
 */
export function observeRun(
  stats: RunStats,
  s: ObservedState,
): { stats: RunStats; moment: Moment | null } {
  // A stage change resets stageBanished to 0: bank what the finished stage had.
  const banked = s.stageBanished < stats.lastStageBanished
    ? stats.banked + stats.lastStageBanished
    : stats.banked

  const peak = Math.max(s.combo, s.bestCombo ?? 1)
  let moment: Moment | null = null
  const entered = s.phase !== stats.phase
  if (entered && s.phase === 'victory') moment = { kind: 'boss', rank: BOSS_MOMENT_RANK }
  else if (entered && s.phase === 'gameover') moment = { kind: 'end', rank: END_MOMENT_RANK }
  else if (peak >= 2 && peak > stats.bestCombo) {
    moment = { kind: 'combo', rank: momentRank('combo', peak) }
  }

  return {
    stats: {
      banked,
      lastStageBanished: s.stageBanished,
      bestCombo: Math.max(stats.bestCombo, peak),
      stage: Math.max(stats.stage, s.stage),
      phase: s.phase,
    },
    moment,
  }
}
