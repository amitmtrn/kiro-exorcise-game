/**
 * New ghosts (more-content): twin wisps, mirror ghost, blink ghost. Pure state machines:
 * no DOM, no canvas, every timer advances by `deltaMs` and carries its overshoot.
 *
 * Rule: every transition that changes vulnerability (into ethereal, solid, open or shield)
 * leaves a telegraph state (warnOut, warnIn, cracking, closing) of at least 500 ms.
 */

import type { Enemy, EnemyType, VariantState } from '../state'

export const MIN_TELEGRAPH_MS = 400
export const TELEGRAPH_MS = 500
export const MIN_WINDOW_MS = 1200
export const MAX_WAIT_MS = 2000
export const MIN_TRAVEL_MS = 4500
/** Same distance as reach.ts CENTER_THRESHOLD (kept here so this module imports nothing from the sim). */
export const REACH_PX = 40

// Wisp
export const TWIN_WINDOW_MS = 2000
export const WISP_SIZE = 64
// Mirror
export const SHIELD_MAX_MS = 1500
export const SHIELD_BREAK_HITS = 2
export const ABSORB_COOLDOWN_MS = 300
export const OPEN_MS = 1300
// Blink
export const SOLID_MS = 1600
export const ETHEREAL_MS = 1400

export type VariantType = 'wisp' | 'mirror' | 'blink'
export const VARIANT_TYPES: readonly VariantType[] = ['wisp', 'mirror', 'blink']

/** Seconds a new ghost needs to reach the centre from its spawn point. */
export const TRAVEL_S: Record<VariantType, number> = { wisp: 5.0, mirror: 6.5, blink: 6.0 }

export function isVariantType(t: EnemyType): t is VariantType {
  return t === 'wisp' || t === 'mirror' || t === 'blink'
}

export interface Stage { state: VariantState; ms: number }

/** The cycle of a type in order. The wisp cycle starts at `lit` (idle waits for a hit and has no timer). */
export function stateSchedule(type: VariantType): Stage[] {
  switch (type) {
    case 'blink':
      return [
        { state: 'solid', ms: SOLID_MS }, { state: 'warnOut', ms: TELEGRAPH_MS },
        { state: 'ethereal', ms: ETHEREAL_MS }, { state: 'warnIn', ms: TELEGRAPH_MS },
      ]
    case 'mirror':
      return [
        { state: 'shield', ms: SHIELD_MAX_MS }, { state: 'cracking', ms: TELEGRAPH_MS },
        { state: 'open', ms: OPEN_MS }, { state: 'closing', ms: TELEGRAPH_MS },
      ]
    case 'wisp':
      return [{ state: 'lit', ms: TWIN_WINDOW_MS - TELEGRAPH_MS }, { state: 'merging', ms: TELEGRAPH_MS }]
  }
}

/** Telegraph states: the old rules still apply while they run. */
export const TELEGRAPH_STATES: readonly VariantState[] = ['warnOut', 'warnIn', 'cracking', 'closing', 'merging']

/** Initial state of a type. */
export function initialState(type: VariantType): VariantState {
  return type === 'blink' ? 'solid' : type === 'mirror' ? 'shield' : 'idle'
}

function durationOf(type: VariantType, state: VariantState): number {
  if (state === 'idle') return Infinity
  return stateSchedule(type).find((s) => s.state === state)?.ms ?? Infinity
}

/** State a timer expiry moves to. */
export function nextState(type: VariantType, state: VariantState): VariantState {
  if (type === 'wisp') return state === 'lit' ? 'merging' : 'idle'
  const cycle = stateSchedule(type)
  const i = cycle.findIndex((s) => s.state === state)
  return cycle[(i + 1) % cycle.length].state
}

/** ms of telegraph left (0 outside a telegraph state). */
export function telegraphLeftMs(e: Enemy): number {
  if (!isVariantType(e.type) || !TELEGRAPH_STATES.includes(e.vState)) return 0
  return Math.max(0, durationOf(e.type, e.vState) - e.vTimerMs)
}

/** Advances the timers by `deltaMs`; loops over state boundaries so overshoot carries. Non-variants are returned as is. */
export function stepVariant(e: Enemy, deltaMs: number): Enemy {
  if (!isVariantType(e.type)) return e
  const type = e.type
  let { vState, vTimerMs } = e
  const absorbMs = Math.max(0, e.absorbMs - deltaMs)
  if (vState !== 'idle') {
    vTimerMs += deltaMs
    for (let guard = 0; guard < 16; guard++) {
      const d = durationOf(type, vState)
      if (vTimerMs < d) break
      vTimerMs -= d
      vState = nextState(type, vState)
      if (vState === 'idle') { vTimerMs = 0; break }
      if (vState === 'shield') e = { ...e, vHits: 0 }
    }
  }
  return { ...e, vState, vTimerMs, absorbMs }
}

/** True when a confirmed hit banishes (or, for a wisp, links) the enemy right now. */
export function isVariantHittable(e: Enemy): boolean {
  switch (e.type) {
    case 'blink': return e.vState === 'solid' || e.vState === 'warnOut'
    case 'mirror': return e.vState === 'open' || e.vState === 'closing'
    case 'wisp': return true
    default: return true
  }
}

export interface AbsorbResult {
  enemy: Enemy
  /** Show clink feedback (a hit outside the cool-down on a protected mirror ghost). */
  absorbed: boolean
  /** This hit cracked the shield. */
  cracked: boolean
}

/** A confirmed hit on a mirror ghost that is `shield` or `cracking`. Other states: nothing absorbed. */
export function onMirrorAbsorb(e: Enemy): AbsorbResult {
  if (e.type !== 'mirror' || (e.vState !== 'shield' && e.vState !== 'cracking') || e.absorbMs > 0) {
    return { enemy: { ...e, hitCount: 0 }, absorbed: false, cracked: false }
  }
  let next: Enemy = { ...e, hitCount: 0, absorbMs: ABSORB_COOLDOWN_MS }
  let cracked = false
  if (e.vState === 'shield') {
    const vHits = e.vHits + 1
    next = { ...next, vHits }
    if (vHits >= SHIELD_BREAK_HITS) { next = { ...next, vState: 'cracking', vTimerMs: 0 }; cracked = true }
  }
  return { enemy: next, absorbed: true, cracked }
}

/** First hit on a wisp: idle becomes lit for the twin window. Lit and merging wisps are unchanged. */
export function lightWisp(e: Enemy): Enemy {
  if (e.type !== 'wisp' || e.vState !== 'idle') return { ...e, hitCount: 0 }
  return { ...e, vState: 'lit', vTimerMs: 0, hitCount: 0 }
}

/** True when a wisp is lit or merging, i.e. a hit on its partner completes the pair. */
export function isLinked(e: Enemy): boolean {
  return e.type === 'wisp' && (e.vState === 'lit' || e.vState === 'merging')
}

/** Speed in canvas heights per second so that the straight trip from (x, y) to the target takes exactly TRAVEL_S. */
export function speedFor(type: VariantType, dist: number, canvasH: number): number {
  return Math.max(dist - REACH_PX, 1) / canvasH / TRAVEL_S[type]
}

/** Seconds-to-ms travel time of an enemy on a straight line (for tests and the demo driver). */
export function travelMs(e: Enemy, canvasH: number): number {
  const dist = Math.hypot(e.targetX - e.x, e.targetY - e.y)
  return (Math.max(dist - REACH_PX, 0) / (e.speed * canvasH)) * 1000
}
