import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createInitialState,
  decrementLife,
  addScore,
  tickTimer,
  removeEnemy,
  addParticles,
  incrementCombo,
  comboForStreak,
  resetCombo,
  makeEnemy,
  setShake,
  tickShake,
  addScoreLabels,
  loadHighScore,
  saveHighScore,
  ROUND_DURATION_MS,
  STARTING_LIVES,
  SHAKE_FRAMES,
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

  it('timeout with a live boss is game over, not summary (boss-phases R6.5)', () => {
    const boss = makeEnemy({ id: 'b', type: 'boss', x: 0, y: 0, targetX: 0, targetY: 0, speed: 0, hitbox: { x: 0, y: 0, w: 1, h: 1 } })
    const r = tickTimer(gs({ phase: 'playing', stage: 5, roundTimeMs: 100, enemies: [boss, enemy('e1')] }), 100)
    expect(r.roundTimeMs).toBe(0)
    expect(r.phase).toBe('gameover')
  })

  it('a boss alive before the timer expires does not end the stage early', () => {
    const boss = makeEnemy({ id: 'b', type: 'boss', x: 0, y: 0, targetX: 0, targetY: 0, speed: 0, hitbox: { x: 0, y: 0, w: 1, h: 1 } })
    expect(tickTimer(gs({ phase: 'playing', roundTimeMs: 100, enemies: [boss] }), 99).phase).toBe('playing')
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

describe('combo reducers (stages R4.1–R4.3)', () => {
  const hits = (n: number) => {
    let s = createInitialState()
    for (let i = 0; i < n; i++) s = incrementCombo(s)
    return s
  }

  it('starts at x1 with no streak', () => {
    const s = createInitialState()
    expect(s.combo).toBe(1)
    expect(s.streak).toBe(0)
  })

  it.each([
    [0, 1], [1, 1], [2, 1],
    [3, 2], [4, 2], [5, 2],
    [6, 3], [7, 3], [9, 3],
    [10, 4], [11, 4], [50, 4],
  ])('comboForStreak(%i) = x%i', (streak, mult) => {
    expect(comboForStreak(streak)).toBe(mult)
  })

  it('incrementCombo crosses each tier on exactly the 3rd, 6th and 10th hit', () => {
    expect(hits(2).combo).toBe(1)
    expect(hits(3).combo).toBe(2)
    expect(hits(5).combo).toBe(2)
    expect(hits(6).combo).toBe(3)
    expect(hits(9).combo).toBe(3)
    expect(hits(10).combo).toBe(4)
  })

  it('never exceeds x4', () => {
    const s = hits(200)
    expect(s.combo).toBe(4)
    expect(s.streak).toBe(200)
    expect(s.bestCombo).toBe(4)
  })

  it('resetCombo (enemy reached the centre) returns to x1 / streak 0, keeping bestCombo', () => {
    let s = hits(6)
    s = decrementLife(resetCombo(s))
    expect(s.combo).toBe(1)
    expect(s.streak).toBe(0)
    expect(s.bestCombo).toBe(3)
    // the climb starts again from scratch
    for (let i = 0; i < 2; i++) s = incrementCombo(s)
    expect(s.combo).toBe(1)
    s = incrementCombo(s)
    expect(s.combo).toBe(2)
  })
})

describe('screen shake reducers (spooky-skin R4.1)', () => {
  it('initial state has no shake and enemies start with no hit flash', () => {
    expect(createInitialState().shakeFrames).toBe(0)
    expect(enemy('x').hitFlashFrames).toBe(0)
  })

  it('setShake stores the frame count and clamps negatives to 0', () => {
    expect(setShake(createInitialState(), SHAKE_FRAMES).shakeFrames).toBe(SHAKE_FRAMES)
    expect(setShake(createInitialState(), -5).shakeFrames).toBe(0)
  })

  it('tickShake counts down one frame per call and stops at 0', () => {
    let s = setShake(createInitialState(), 2)
    s = tickShake(s); expect(s.shakeFrames).toBe(1)
    s = tickShake(s); expect(s.shakeFrames).toBe(0)
    s = tickShake(s); expect(s.shakeFrames).toBe(0)
  })

  it('tickShake is time-based: the same elapsed time leaves the same shake at any step size (pbt BUG-4)', () => {
    const run = (stepMs: number) => {
      let s = setShake(createInitialState(), SHAKE_FRAMES)
      for (let t = 0; t < 33.3333 - 1e-9; t += stepMs) s = tickShake(s, stepMs)
      return s.shakeFrames
    }
    expect(run(1000 / 60)).toBeCloseTo(1, 6)
    expect(run(1000 / 120)).toBeCloseTo(1, 6)
    expect(run(1000 / 30)).toBeCloseTo(1, 6)
  })
})

describe('score labels (spooky-skin R5.2)', () => {
  it('initial state has no score labels', () => {
    expect(createInitialState().scoreLabels).toHaveLength(0)
  })

  it('addScoreLabels appends without mutating the input', () => {
    const base = createInitialState()
    const s = addScoreLabels(base, [{ x: 0, y: 0, text: '+100', alpha: 1, vy: -1 }])
    expect(s.scoreLabels).toHaveLength(1)
    expect(base.scoreLabels).toHaveLength(0)
  })
})

describe('high score persistence (stages T1 / T9)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('saveHighScore writes to localStorage and loadHighScore reads it back', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
    })
    saveHighScore(4200)
    expect(loadHighScore()).toBe(4200)
    expect(store.get('exorcise-highscore')).toBe('4200')
  })

  it('loadHighScore falls back to 0 when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    expect(loadHighScore()).toBe(0)
    expect(() => saveHighScore(1)).not.toThrow()
  })

  it('createInitialState picks up the stored high score', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '999',
      setItem: () => {},
    })
    expect(createInitialState().highScore).toBe(999)
  })
})

describe('tickShake residue (pbt REV-2)', () => {
  it('snaps jitter residue to zero', () => {
    let s = { ...createInitialState(1), shakeFrames: 3 }
    for (let i = 0; i < 3; i++) s = tickShake(s, 16.6)
    expect(s.shakeFrames).toBe(0)
  })
})
