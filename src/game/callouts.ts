/**
 * Combo call-outs (juice R4): "x3 COMBO!" when the multiplier tier rises and a
 * praise word ("NICE!", "GREAT!", "PERFECT!") on every second streak count.
 */

import { calloutCap } from './quality'
import { easeOutBack } from './transitions'

export const CALLOUT_LIFE_MS = 900
export const MAX_CALLOUTS = 3
/** A praise word shows when `streak % PRAISE_EVERY === 0`. */
export const PRAISE_EVERY = 2
export const CALLOUT_POP_MS = 150
/** Fraction of the lifetime during which a call-out stays fully opaque. */
export const CALLOUT_HOLD = 0.6
export const CALLOUT_RISE_PX = 40

export const PRAISE: Readonly<Record<2 | 3 | 4, string>> = {
  2: 'NICE!',
  3: 'GREAT!',
  4: 'PERFECT!',
}

export type CalloutKind = 'tierUp' | 'praise' | 'tip'

export interface Callout {
  x: number
  y: number
  text: string
  kind: CalloutKind
  ageMs: number
  lifeMs: number
}

export interface CalloutChoice { text: string; kind: CalloutKind }

/**
 * Pure choice of call-out for a banish that took the combo from `prevCombo` to
 * `newCombo` and the streak to `streak`.
 */
export function selectCallout(prevCombo: number, newCombo: number, streak: number): CalloutChoice | null {
  if (newCombo > prevCombo && newCombo >= 2) return { text: `x${newCombo} COMBO!`, kind: 'tierUp' }
  if (newCombo >= 2 && streak > 0 && streak % PRAISE_EVERY === 0) {
    const tier = Math.min(4, newCombo) as 2 | 3 | 4
    return { text: PRAISE[tier], kind: 'praise' }
  }
  return null
}

/** Starts above the enemy and stays inside the canvas. */
export function makeCallout(x: number, y: number, choice: CalloutChoice, canvasW: number, canvasH: number): Callout {
  const cx = Math.min(canvasW * 0.8, Math.max(canvasW * 0.2, x))
  const cy = Math.min(canvasH * 0.9, Math.max(canvasH * 0.14, y - 70))
  return { x: cx, y: cy, text: choice.text, kind: choice.kind, ageMs: 0, lifeMs: CALLOUT_LIFE_MS }
}

/** Appends a call-out; beyond MAX_CALLOUTS the oldest is dropped. */
export function addCallout(list: Callout[], c: Callout): Callout[] {
  const next = [...list, c]
  const cap = calloutCap() // playtest-polish R3.4: 3 at full quality, 1 below
  return next.length > cap ? next.slice(next.length - cap) : next
}

export function tickCallouts(list: Callout[], deltaMs: number): Callout[] {
  if (list.length === 0) return list
  return list
    .map((c) => ({ ...c, ageMs: c.ageMs + deltaMs }))
    .filter((c) => c.ageMs < c.lifeMs)
}

export interface CalloutPose { scale: number; alpha: number; dy: number }

/** Pop-in with overshoot, rise, hold, then fade. */
export function calloutPose(c: Callout): CalloutPose {
  const t = Math.min(1, Math.max(0, c.ageMs / c.lifeMs))
  const scale = easeOutBack(c.ageMs / CALLOUT_POP_MS)
  const alpha = t <= CALLOUT_HOLD ? 1 : 1 - (t - CALLOUT_HOLD) / (1 - CALLOUT_HOLD)
  return { scale, alpha, dy: -CALLOUT_RISE_PX * t }
}
