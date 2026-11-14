/**
 * Stage 6 helpers (more-content R5): when the finale boss is due, the arrival banner and the
 * first-sighting tips. Pure; every time is stage-clock milliseconds (`deltaMs`-driven).
 */

import type { GameState } from './state'
import { STAGES } from './stages'
import { makeCallout, addCallout } from './callouts'
import type { VariantType } from './enemies/variants'

/** Tip call-out of each new ghost, shown once per stage next to its first spawn. */
export const TIPS: Readonly<Record<VariantType, string>> = {
  wisp: 'HIT BOTH!',
  mirror: 'WAVE TWICE!',
  blink: 'WAIT FOR SOLID!',
}
export const TIP_MS = 1800
export const KING_BANNER = 'THE HOLLOW KING!'
export const KING_BANNER_MS = 2500
/** A scripted spawn that could not fit within this long after its time is dropped. */
export const VARIANT_DEFER_MAX_MS = 3000

/** Stage clock: elapsed ms of the current stage (0 before it starts, capped at its length). */
export function stageElapsedMs(state: Pick<GameState, 'stage' | 'roundTimeMs'>): number {
  const cfg = STAGES[state.stage - 1]
  if (!cfg) return 0
  return Math.min(cfg.durationMs, Math.max(0, cfg.durationMs - state.roundTimeMs))
}

/** True when the boss of this stage should be on the field and is not yet (stage 5: at once; stage 6: at `bossAtMs`). */
export function bossDue(state: Pick<GameState, 'stage' | 'roundTimeMs' | 'bossActive' | 'bonus'>): boolean {
  if (state.bossActive || state.bonus) return false
  const cfg = STAGES[state.stage - 1]
  if (!cfg || !cfg.enemyMix.boss) return false
  if (!cfg.finale) return true
  return stageElapsedMs(state) >= cfg.finale.bossAtMs
}

/** Adds a tip call-out for `kind` the first time it appears in this stage. */
export function withTip(state: GameState, kind: VariantType, x: number, y: number, W: number, H: number): GameState {
  if (state.seenVariants.includes(kind)) return state
  const c = { ...makeCallout(x, y, { text: TIPS[kind], kind: 'tip' }, W, H), lifeMs: TIP_MS }
  return { ...state, seenVariants: [...state.seenVariants, kind], callouts: addCallout(state.callouts, c) }
}

/** The "THE HOLLOW KING!" banner, once, `warnBeforeMs` before the boss enters. */
export function withKingWarning(state: GameState, W: number, H: number): GameState {
  const cfg = STAGES[state.stage - 1]
  if (!cfg?.finale || state.bonus || state.bossActive || state.seenVariants.includes('king')) return state
  if (stageElapsedMs(state) < cfg.finale.bossAtMs - cfg.finale.warnBeforeMs) return state
  const c = { ...makeCallout(W / 2, H * 0.4, { text: KING_BANNER, kind: 'tip' }, W, H), lifeMs: KING_BANNER_MS }
  return { ...state, seenVariants: [...state.seenVariants, 'king'], callouts: addCallout(state.callouts, c) }
}
