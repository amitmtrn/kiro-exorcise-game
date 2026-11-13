import { describe, it, expect } from 'vitest'
import {
  spawnGhostPuff, spawnBatPuff, tickParticles,
  spawnScoreLabel, tickScoreLabels, SCORE_LABEL_LIFETIME_FRAMES,
} from './particles'

describe('spawnGhostPuff', () => {
  it('produces exactly 20 particles', () => {
    expect(spawnGhostPuff(320, 240)).toHaveLength(20)
  })

  it('all particles start with alpha = 1', () => {
    expect(spawnGhostPuff(0, 0).every((p) => p.alpha === 1)).toBe(true)
  })

  it('particles are near the spawn center', () => {
    const particles = spawnGhostPuff(300, 200)
    for (const p of particles) {
      expect(Math.abs(p.x - 300)).toBeLessThan(30)
      expect(Math.abs(p.y - 200)).toBeLessThan(30)
    }
  })
})

describe('spawnBatPuff', () => {
  it('produces exactly 10 particles', () => {
    expect(spawnBatPuff(100, 100)).toHaveLength(10)
  })

  it('all particles start with alpha = 1', () => {
    expect(spawnBatPuff(0, 0).every((p) => p.alpha === 1)).toBe(true)
  })
})

describe('tickParticles', () => {
  it('moves particles by their velocity', () => {
    const p = { x: 0, y: 0, vx: 3, vy: -2, alpha: 1, decay: 0.01, color: '#fff', radius: 3 }
    const [moved] = tickParticles([p])
    expect(moved.x).toBeCloseTo(3)
    // y moves by vy·dt + ½·g·dt² (exact for constant gravity, step-size independent)
    expect(moved.y).toBeCloseTo(-2 + 0.5 * 0.15)
  })

  it('applies gravity (vy increases each tick)', () => {
    const p = { x: 0, y: 0, vx: 0, vy: 0, alpha: 1, decay: 0.001, color: '#fff', radius: 3 }
    const [t1] = tickParticles([p])
    const [t2] = tickParticles([t1])
    expect(t2.vy).toBeGreaterThan(t1.vy)
  })

  it('decrements alpha by decay each tick', () => {
    const p = { x: 0, y: 0, vx: 0, vy: 0, alpha: 1, decay: 0.1, color: '#fff', radius: 3 }
    const [t1] = tickParticles([p])
    expect(t1.alpha).toBeCloseTo(0.9)
  })

  it('removes particles when alpha reaches 0', () => {
    const p = { x: 0, y: 0, vx: 0, vy: 0, alpha: 0.05, decay: 0.1, color: '#fff', radius: 3 }
    const result = tickParticles([p])
    expect(result).toHaveLength(0)
  })

  it('particle count decreases over time until all are gone', () => {
    let particles = spawnGhostPuff(0, 0)
    let prevCount = particles.length

    // Tick until all gone
    let ticks = 0
    while (particles.length > 0 && ticks < 500) {
      particles = tickParticles(particles)
      expect(particles.length).toBeLessThanOrEqual(prevCount)
      prevCount = particles.length
      ticks++
    }
    expect(particles).toHaveLength(0)
  })
})

describe('score pop labels (spooky-skin R5.2)', () => {
  it('spawnScoreLabel formats "+N", starts opaque, above the enemy, moving up', () => {
    const l = spawnScoreLabel(300, 200, 150)
    expect(l.text).toBe('+150')
    expect(l.alpha).toBe(1)
    expect(l.x).toBe(300)
    expect(l.y).toBeLessThan(200)
    expect(l.vy).toBeLessThan(0)
  })

  it('tickScoreLabels drifts labels upward and fades them', () => {
    const [t1] = tickScoreLabels([spawnScoreLabel(0, 100, 100)])
    expect(t1.y).toBeLessThan(76) // spawned at y - 24, then moved up again
    expect(t1.alpha).toBeLessThan(1)
    expect(t1.alpha).toBeGreaterThan(0)
  })

  it('a label lives for ~600 ms (SCORE_LABEL_LIFETIME_FRAMES ticks) then disappears', () => {
    let labels = [spawnScoreLabel(0, 0, 100)]
    let ticks = 0
    while (labels.length > 0 && ticks < 500) { labels = tickScoreLabels(labels); ticks++ }
    expect(labels).toHaveLength(0)
    expect(ticks).toBe(SCORE_LABEL_LIFETIME_FRAMES)
    expect(SCORE_LABEL_LIFETIME_FRAMES / 60).toBeCloseTo(0.6, 1)
  })
})
