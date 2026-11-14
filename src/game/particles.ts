/**
 * Particle system — spawns and ticks canvas particles for hit effects,
 * plus the floating score-pop labels (spooky-skin R5.2).
 */

import type { Particle, ScoreLabel } from './state'
import { FRAME_MS } from './state'

const GRAVITY = 0.15

/** Score labels fade over ~600 ms at 60 fps. */
export const SCORE_LABEL_LIFETIME_FRAMES = 36
const SCORE_LABEL_DECAY = 1 / SCORE_LABEL_LIFETIME_FRAMES
const SCORE_LABEL_RISE_PX = 1.4

// ─── Spawn helpers ────────────────────────────────────────────────────────────

/** 20-particle white/blue puff for ghost hits. */
export function spawnGhostPuff(cx: number, cy: number): Particle[] {
  return Array.from({ length: 20 }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 1 + Math.random() * 4
    const isBlue = Math.random() < 0.4
    return {
      x: cx + (Math.random() - 0.5) * 20,
      y: cy + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1, // slight upward bias
      alpha: 1,
      decay: 1 / (24 * 0.4 * (0.8 + Math.random() * 0.4)), // ~400 ms at 60 fps
      color: isBlue ? '#aaccff' : '#e8e8f0',
      radius: 2 + Math.random() * 4,
    }
  })
}

/** 10-particle orange puff for bat hits. */
export function spawnBatPuff(cx: number, cy: number): Particle[] {
  return Array.from({ length: 10 }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 1.5 + Math.random() * 3.5
    return {
      x: cx + (Math.random() - 0.5) * 16,
      y: cy + (Math.random() - 0.5) * 16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5,
      alpha: 1,
      decay: 1 / (24 * 0.35 * (0.8 + Math.random() * 0.4)), // ~350 ms
      color: Math.random() < 0.5 ? '#ff6b1a' : '#ffd166',
      radius: 2 + Math.random() * 3,
    }
  })
}

/** 8-particle cool-blue spark ring for a swat absorbed by a mirror ghost's shield (never skull orange or red). */
export function spawnShieldSparks(cx: number, cy: number): Particle[] {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.3
    const speed = 2 + Math.random() * 2
    return {
      x: cx + Math.cos(angle) * 30,
      y: cy + Math.sin(angle) * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      decay: 1 / (24 * 0.3),
      color: i % 2 === 0 ? '#9fe8ff' : '#e8e8f0',
      radius: 2 + Math.random() * 2,
    }
  })
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

/**
 * Advances every particle by `deltaMs` (default: one 60 Hz frame), applies
 * gravity, decrements alpha. Constant-acceleration integration makes the result
 * independent of how the elapsed time is split into steps. Returns a new array
 * with dead particles (alpha ≤ 0) removed.
 */
export function tickParticles(particles: Particle[], deltaMs: number = FRAME_MS): Particle[] {
  const dt = deltaMs / FRAME_MS
  return particles
    .map((p) => ({
      ...p,
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt + 0.5 * GRAVITY * dt * dt,
      vy: p.vy + GRAVITY * dt,
      alpha: p.alpha - p.decay * dt,
    }))
    .filter((p) => p.alpha > 0)
}

// ─── Score pop labels (spooky-skin R5.2) ──────────────────────────────────────

/** A "+N" label that starts just above the enemy and drifts upward. */
export function spawnScoreLabel(x: number, y: number, points: number): ScoreLabel {
  return { x, y: y - 24, text: `+${points}`, alpha: 1, vy: -SCORE_LABEL_RISE_PX }
}

/** Moves every label up by its velocity and fades it over `deltaMs`; removes dead labels. */
export function tickScoreLabels(labels: ScoreLabel[], deltaMs: number = FRAME_MS): ScoreLabel[] {
  const dt = deltaMs / FRAME_MS
  return labels
    .map((l) => ({ ...l, y: l.y + l.vy * dt, alpha: l.alpha - SCORE_LABEL_DECAY * dt }))
    .filter((l) => l.alpha > 0)
}
