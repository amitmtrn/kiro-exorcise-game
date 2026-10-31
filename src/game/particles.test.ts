import { describe, it, expect } from 'vitest'
import { spawnGhostPuff, spawnBatPuff, tickParticles } from './particles'

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
    // y moves by initial vy (-2); gravity is applied to vy after position update
    expect(moved.y).toBeCloseTo(-2)
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
