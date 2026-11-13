/**
 * Knock-back (juice R2): a banished enemy flies off along the swipe vector,
 * spinning, shrinking and fading. The pose is a closed-form function of the
 * knock's age, so it never depends on how that age was split into steps.
 */

import type { Enemy } from './state'
import type { Swipe } from './swipe'

export const KNOCK_LIFE_MS = 600
/** Initial speed in canvas heights per second. */
export const KNOCK_SPEED = 2.2
/** Exponential drag rate (1/s): total travel is speed / drag. */
export const KNOCK_DRAG = 4
export const KNOCK_MIN_SCALE = 0.4
/** Spin rate in rad/s; the sign follows the horizontal swipe direction. */
export const KNOCK_SPIN = 9
export const KNOCK_MIN_STRENGTH = 0.6
export const KNOCK_MAX_STRENGTH = 1.5
/** Hard cap so a pathological burst can never grow the list without bound. */
export const MAX_KNOCKS = 16

export interface Knock {
  /** Snapshot of the enemy at the moment of the hit (drawn with the normal routines). */
  enemy: Enemy
  x0: number
  y0: number
  /** Unit swipe vector. */
  ux: number
  uy: number
  /** Initial speed in px/s. */
  speed: number
  /** rad/s, signed. */
  spin: number
  ageMs: number
  lifeMs: number
}

export interface KnockPose {
  x: number
  y: number
  angle: number
  scale: number
  alpha: number
  /** Distance travelled from the origin in px. */
  distance: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function makeKnock(enemy: Enemy, swipe: Swipe, canvasH: number): Knock {
  const strength = swipe.source === 'shift'
    ? clamp(swipe.mag / (0.1 * canvasH), KNOCK_MIN_STRENGTH, KNOCK_MAX_STRENGTH)
    : 1
  return {
    enemy,
    x0: enemy.x,
    y0: enemy.y,
    ux: swipe.dx,
    uy: swipe.dy,
    speed: KNOCK_SPEED * canvasH * strength,
    spin: swipe.dx < 0 ? -KNOCK_SPIN : KNOCK_SPIN,
    ageMs: 0,
    lifeMs: KNOCK_LIFE_MS,
  }
}

export function knockPose(k: Knock): KnockPose {
  const t = Math.max(0, k.ageMs) / 1000
  const distance = (k.speed * (1 - Math.exp(-KNOCK_DRAG * t))) / KNOCK_DRAG
  const progress = clamp(k.ageMs / k.lifeMs, 0, 1)
  return {
    x: k.x0 + k.ux * distance,
    y: k.y0 + k.uy * distance,
    angle: k.spin * t,
    scale: 1 - (1 - KNOCK_MIN_SCALE) * progress,
    alpha: 1 - progress,
    distance,
  }
}

/** Ages every knock by `deltaMs` and drops the ones that reached the end of their life. */
export function tickKnocks(knocks: Knock[], deltaMs: number): Knock[] {
  if (knocks.length === 0) return knocks
  return knocks
    .map((k) => ({ ...k, ageMs: k.ageMs + deltaMs }))
    .filter((k) => k.ageMs < k.lifeMs)
}

/** Appends a knock, dropping the oldest beyond MAX_KNOCKS. */
export function addKnock(knocks: Knock[], k: Knock): Knock[] {
  const next = [...knocks, k]
  return next.length > MAX_KNOCKS ? next.slice(next.length - MAX_KNOCKS) : next
}
