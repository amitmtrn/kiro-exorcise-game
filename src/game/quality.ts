/**
 * Adaptive quality (playtest-polish R1, R3.4). A frame-budget monitor steps the
 * quality level down when the rolling frame time stays over budget and back up
 * when it stays well under, with hysteresis. Everything is in milliseconds
 * (`deltaMs`), never in frames.
 *
 * The reducer is pure; a small module state holds the active level for readers
 * outside the loop (particle spawning, call-outs, atmosphere, debug overlay).
 */

export type QualityLevel = 0 | 1 | 2 | 3
export type QualityMode = 'auto' | 'high' | 'med' | 'low'

export const MAX_LEVEL: QualityLevel = 3
/** Average frame time above this for DOWN_AFTER_MS steps down. */
export const BUDGET_DOWN_MS = 20
export const DOWN_AFTER_MS = 2000
/** Average frame time below this for UP_AFTER_MS steps up. */
export const BUDGET_UP_MS = 14
export const UP_AFTER_MS = 6000
/** No level change this soon after a change. */
export const SETTLE_MS = 3000
/** Time constant of the rolling average. */
export const AVG_TAU_MS = 1000
/** Frames longer than this (hidden tab, debugger) are not counted. */
export const IGNORE_ABOVE_MS = 250
/** A step down within this long after a step up lengthens the next up wait. */
export const FLIP_WINDOW_MS = 30_000
export const MAX_UP_PENALTY = 4
/** The average is re-seeded here after a change (middle of the 14–20 ms band). */
export const RESEED_MS = 17

export interface FrameBudgetState {
  level: QualityLevel
  /** Time-weighted rolling average of the frame time, ms. */
  avgMs: number
  overMs: number
  underMs: number
  settleMs: number
  sinceUpMs: number
  upPenalty: number
}

export function createFrameBudget(level: QualityLevel = 0): FrameBudgetState {
  return { level, avgMs: 16, overMs: 0, underMs: 0, settleMs: 0, sinceUpMs: Number.POSITIVE_INFINITY, upPenalty: 1 }
}

/** Advances the controller by one frame of `deltaMs`. Pure. */
export function stepFrameBudget(s: FrameBudgetState, deltaMs: number): FrameBudgetState {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > IGNORE_ABOVE_MS) return s
  const avgMs = s.avgMs + (deltaMs - s.avgMs) * (1 - Math.exp(-deltaMs / AVG_TAU_MS))
  const sinceUpMs = s.sinceUpMs + deltaMs
  if (s.settleMs > 0) {
    return { ...s, avgMs, sinceUpMs, settleMs: Math.max(0, s.settleMs - deltaMs), overMs: 0, underMs: 0 }
  }
  const overMs = avgMs > BUDGET_DOWN_MS ? s.overMs + deltaMs : 0
  const underMs = avgMs < BUDGET_UP_MS ? s.underMs + deltaMs : 0
  if (overMs >= DOWN_AFTER_MS && s.level < MAX_LEVEL) {
    const upPenalty = sinceUpMs < FLIP_WINDOW_MS ? Math.min(MAX_UP_PENALTY, s.upPenalty * 2) : 1
    return { level: (s.level + 1) as QualityLevel, avgMs: RESEED_MS, overMs: 0, underMs: 0, settleMs: SETTLE_MS, sinceUpMs, upPenalty }
  }
  if (underMs >= UP_AFTER_MS * s.upPenalty && s.level > 0) {
    return { level: (s.level - 1) as QualityLevel, avgMs: RESEED_MS, overMs: 0, underMs: 0, settleMs: SETTLE_MS, sinceUpMs: 0, upPenalty: s.upPenalty }
  }
  return { ...s, avgMs, overMs, underMs, sinceUpMs }
}

// ─── URL override ────────────────────────────────────────────────────────────

/** `?quality=low|med|high|auto`; anything else is `auto`. */
export function parseQualityMode(search: string): QualityMode {
  let v: string | null = null
  try { v = new URLSearchParams(search).get('quality') } catch { /* ignore */ }
  const m = v?.toLowerCase()
  return m === 'low' || m === 'med' || m === 'high' ? m : 'auto'
}

/** Pinned level of a mode, or null for auto. */
export function levelForMode(mode: QualityMode): QualityLevel | null {
  switch (mode) {
    case 'high': return 0
    case 'med': return 2
    case 'low': return 3
    default: return null
  }
}

// ─── Active level (module state) ─────────────────────────────────────────────

let activeLevel: QualityLevel = 0
let activeMode: QualityMode = 'auto'
let lastAvgMs = 0

export interface QualityInfo { level: QualityLevel; mode: QualityMode; avgMs: number }

export function getQuality(): QualityLevel { return activeLevel }
export function getQualityInfo(): QualityInfo { return { level: activeLevel, mode: activeMode, avgMs: lastAvgMs } }
export function setQualityLevel(level: QualityLevel): void { activeLevel = level }
export function setQualityAvg(avgMs: number): void { lastAvgMs = avgMs }

/** Sets the mode; a pinned mode also sets its level. `auto` keeps the current level. */
export function configureQuality(mode: QualityMode): void {
  activeMode = mode
  const pinned = levelForMode(mode)
  if (pinned !== null) activeLevel = pinned
}

/** Back to level 0 / auto (demo mode, tests). */
export function resetQuality(): void { activeLevel = 0; activeMode = 'auto'; lastAvgMs = 0 }

/** Debug overlay line: `Q2 auto  17.4 ms  160×90`. */
export function formatQualityLine(info: QualityInfo, grid: { w: number; h: number }): string {
  return `Q${info.level} ${info.mode}  ${info.avgMs.toFixed(1)} ms  ${grid.w}×${grid.h}`
}

// ─── Level effects ───────────────────────────────────────────────────────────

/** Keeps every 2nd item from level 1 up; the input array itself at level 0. */
export function thinParticles<T>(items: T[], level: QualityLevel = activeLevel): T[] {
  if (level === 0 || items.length <= 1) return items
  return items.filter((_, i) => i % 2 === 0)
}

/** Maximum simultaneous combo call-outs. */
export function calloutCap(level: QualityLevel = activeLevel): number {
  return level === 0 ? 3 : 1
}

/** Fog and candle flicker are drawn below level 3. */
export function atmosphereOn(level: QualityLevel = activeLevel): boolean {
  return level < 3
}
