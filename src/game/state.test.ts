import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  decrementLife,
  addScore,
  tickTimer,
  removeEnemy,
  addParticles,
  incrementCombo,
  resetCombo,
  makeEnemy,
  ROUND_DURATION_MS,
  STARTING_LIVES,
} from './state'
import type { GameState, Particle } from './state'

const gs = (o: Partial<GameState>): GameState => ({ ...createInitialState(), ...o }) as GameState

function enemy(id: string) {
  return makeEnemy({
    id, type: 'ghost', x: 100, y: 100,
    targetX: 320, targetY: 240, speed: 1.2,
    hitbox: { x: 60, y: 60, w: 80, h: 80 },
  })
}

function makeParticle(): Particle {
  return { x: 0, y: 0, vx: 1, vy: -1, alpha: 1, decay: 0.05, color: '#fff', radius: 4 }
}

describe('createInitialState', () => {
  it('starts with correct defaults', () => {
    const s = createInitialState()
    expect(s.phase).toBe('start')
    expect(s.lives).toBe(STARTING_LIVES)
    expect(s.score).toBe(0)
    expect(s.roundTimeMs).toBe(ROUND_DURATION_MS)
    expect(s.enemies).toHaveLength(0)
    expect(s.stage).toBe(1)
    expect(s.combo).toBe(1)
  })
})

describe('decrementLife', () => {
  it('reduces lives by 1', () => {
    const s = decrementLife(createInitialState())
    expect(s.lives).toBe(STARTING_LIVES - 1)
  })

  it('transitions to gameover when lives reach 0', () => {
    let s = createInitialState()
    s = decrementLife(s); s = decrementLife(s); s = decrementLife(s)
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
  it('increments score', () => {
    expect(addScore(createInitialState(), 100).score).toBe(100)
  })

  it('updates highScore when exceeded', () => {
    const s = addScore(gs({ highScore: 50 }), 100)
    expect(s.highScore).toBe(100)
  })

  it('does not lower highScore', () => {
    const s = addScore(gs({ highScore: 500 }), 100)
    expect(s.highScore).toBe(500)
  })
})

describe('tickTimer', () => {
  it('decrements roundTimeMs', () => {
    const r = tickTimer(gs({ phase: 'playing' }), 1000)
    expect(r.roundTimeMs).toBe(ROUND_DURATION_MS - 1000)
    expect(r.phase).toBe('playing')
  })

  it('transitions to summary and clears enemies at 0', () => {
    const r = tickTimer(gs({ phase: 'playing', enemies: [enemy('e1')] }), ROUND_DURATION_MS)
    expect(r.roundTimeMs).toBe(0)
    expect(r.phase).toBe('summary')
    expect(r.enemies).toHaveLength(0)
  })

  it('clamps to 0', () => {
    expect(tickTimer(gs({ phase: 'playing' }), ROUND_DURATION_MS + 9999).roundTimeMs).toBe(0)
  })
})

describe('removeEnemy', () => {
  it('removes the matching enemy', () => {
    const r = removeEnemy(gs({ enemies: [enemy('a'), enemy('b')] }), 'a')
    expect(r.enemies).toHaveLength(1)
    expect(r.enemies[0].id).toBe('b')
  })

  it('is a no-op for unknown id', () => {
    expect(removeEnemy(gs({ enemies: [enemy('a')] }), 'xyz').enemies).toHaveLength(1)
  })
})

describe('addParticles', () => {
  it('appends particles', () => {
    let s = addParticles(createInitialState(), [makeParticle(), makeParticle()])
    expect(s.particles).toHaveLength(2)
    s = addParticles(s, [makeParticle()])
    expect(s.particles).toHaveLength(3)
  })
})

describe('combo reducers', () => {
  it('incrementCombo increases by 1 and updates bestCombo', () => {
    let s = incrementCombo(createInitialState())
    expect(s.combo).toBe(2)
    s = incrementCombo(s)
    expect(s.bestCombo).toBe(3)
  })

  it('resetCombo returns to 1 without lowering bestCombo', () => {
    let s = incrementCombo(incrementCombo(createInitialState()))
    s = resetCombo(s)
    expect(s.combo).toBe(1)
    expect(s.bestCombo).toBe(3)
  })
})
