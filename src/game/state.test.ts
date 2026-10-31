import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  decrementLife,
  addScore,
  tickTimer,
  removeEnemy,
  addParticles,
  ROUND_DURATION_MS,
  STARTING_LIVES,
} from './state'
import type { Enemy, Particle } from './state'

function makeEnemy(id: string): Enemy {
  return {
    id,
    type: 'ghost',
    x: 100, y: 100,
    targetX: 320, targetY: 240,
    speed: 1.2,
    sineOffset: 0,
    hitbox: { x: 60, y: 60, w: 80, h: 80 },
  }
}

function makeParticle(): Particle {
  return { x: 0, y: 0, vx: 1, vy: -1, alpha: 1, decay: 0.05, color: '#fff', radius: 4 }
}

describe('createInitialState', () => {
  it('starts with correct defaults', () => {
    const s = createInitialState()
    expect(s.phase).toBe('playing')
    expect(s.lives).toBe(STARTING_LIVES)
    expect(s.score).toBe(0)
    expect(s.roundTimeMs).toBe(ROUND_DURATION_MS)
    expect(s.enemies).toHaveLength(0)
    expect(s.particles).toHaveLength(0)
  })
})

describe('decrementLife', () => {
  it('reduces lives by 1', () => {
    const s = decrementLife(createInitialState())
    expect(s.lives).toBe(STARTING_LIVES - 1)
    expect(s.phase).toBe('playing')
  })

  it('transitions to gameover when lives reach 0', () => {
    let s = createInitialState()
    s = decrementLife(s)
    s = decrementLife(s)
    s = decrementLife(s)
    expect(s.lives).toBe(0)
    expect(s.phase).toBe('gameover')
  })

  it('does not go below 0 lives', () => {
    let s = createInitialState()
    for (let i = 0; i < 10; i++) s = decrementLife(s)
    expect(s.lives).toBe(0)
  })
})

describe('addScore', () => {
  it('increments score by given amount', () => {
    const s = addScore(createInitialState(), 100)
    expect(s.score).toBe(100)
  })

  it('accumulates across multiple calls', () => {
    let s = createInitialState()
    s = addScore(s, 100)
    s = addScore(s, 50)
    expect(s.score).toBe(150)
  })
})

describe('tickTimer', () => {
  it('decrements roundTimeMs by deltaMs', () => {
    const s = tickTimer(createInitialState(), 1000)
    expect(s.roundTimeMs).toBe(ROUND_DURATION_MS - 1000)
    expect(s.phase).toBe('playing')
  })

  it('transitions to gameover and clears enemies when time reaches 0', () => {
    let s = createInitialState()
    s = { ...s, enemies: [makeEnemy('e1')] }
    s = tickTimer(s, ROUND_DURATION_MS)
    expect(s.roundTimeMs).toBe(0)
    expect(s.phase).toBe('gameover')
    expect(s.enemies).toHaveLength(0)
  })

  it('clamps roundTimeMs to 0, not negative', () => {
    const s = tickTimer(createInitialState(), ROUND_DURATION_MS + 9999)
    expect(s.roundTimeMs).toBe(0)
  })
})

describe('removeEnemy', () => {
  it('removes the enemy with the matching id', () => {
    let s = createInitialState()
    s = { ...s, enemies: [makeEnemy('a'), makeEnemy('b')] }
    s = removeEnemy(s, 'a')
    expect(s.enemies).toHaveLength(1)
    expect(s.enemies[0].id).toBe('b')
  })

  it('is a no-op for an unknown id', () => {
    let s = createInitialState()
    s = { ...s, enemies: [makeEnemy('a')] }
    s = removeEnemy(s, 'xyz')
    expect(s.enemies).toHaveLength(1)
  })
})

describe('addParticles', () => {
  it('appends new particles to the list', () => {
    let s = createInitialState()
    s = addParticles(s, [makeParticle(), makeParticle()])
    expect(s.particles).toHaveLength(2)
    s = addParticles(s, [makeParticle()])
    expect(s.particles).toHaveLength(3)
  })
})
