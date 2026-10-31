/**
 * Particle system — spawns and ticks canvas particles for hit effects.
 */

import type { Particle } from './state'

const GRAVITY = 0.15

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

// ─── Tick ─────────────────────────────────────────────────────────────────────

/**
 * Moves every particle one step, applies gravity, decrements alpha.
 * Returns a new array with dead particles (alpha ≤ 0) removed.
 */
export function tickParticles(particles: Particle[]): Particle[] {
  return particles
    .map((p) => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vy: p.vy + GRAVITY,
      alpha: p.alpha - p.decay,
    }))
    .filter((p) => p.alpha > 0)
}
