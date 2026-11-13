import { describe, it, expect } from 'vitest'
import { moveEnemies, cullExitedEnemies } from './movement'
import { makeEnemy, createInitialState } from '../state'
import type { GameState } from '../state'
import type { Enemy, EnemyType } from '../state'
import { createGhost } from './ghost'
import { STAGES } from '../stages'
import { tickSpawners } from './spawn'

const W = 1920
const H = 1080

function make(type: EnemyType, speed: number, canvasH = H, canvasW = W): Enemy {
  return makeEnemy({
    id: 't', type,
    x: -40, y: canvasH / 2,
    targetX: canvasW / 2, targetY: canvasH / 2,
    speed,
    sineOffset: 0.7,
    hitbox: { x: 0, y: 0, w: 1, h: 1 },
  })
}

/** Simulate `totalMs` of game time using fixed steps of 1000/hz ms. */
function simulate(e: Enemy, totalMs: number, hz: number, canvasW = W, canvasH = H): Enemy {
  const frames = Math.round((totalMs / 1000) * hz)
  const dt = 1000 / hz
  let cur = [e]
  for (let i = 0; i < frames; i++) cur = moveEnemies(cur, dt, canvasW, canvasH)
  return cur[0]
}

describe('movement is frame-rate independent', () => {
  for (const type of ['ghost', 'bat', 'pumpkin', 'skull'] as const) {
    it(`${type}: 1 s at 60/120/144 Hz ends within 2 px`, () => {
      const e = make(type, 0.3)
      const a = simulate(e, 1000, 60)
      const b = simulate(e, 1000, 120)
      const c = simulate(e, 1000, 144)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(2)
      expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeLessThan(2)
      expect(Math.abs(a.sineOffset - c.sineOffset)).toBeLessThan(1e-9)
    })
  }

  it('lunger approach and lunge are frame-rate independent', () => {
    for (const phase of ['approach', 'lunge'] as const) {
      const l = { ...make('lunger', 0.1), movePhase: phase }
      const a = simulate(l, 500, 60)
      const b = simulate(l, 500, 144)
      expect(Math.abs(a.x - b.x)).toBeLessThan(2)
    }
  })

  it('does not overshoot its target on a long frame', () => {
    const e = { ...make('skull', 5), x: 900 }
    const [m] = moveEnemies([e], 100, W, H)
    expect(m.x).toBeLessThanOrEqual(W / 2 + 1e-9)
  })
})

describe('movement scales with canvas size', () => {
  it('doubling canvas height doubles distance covered in 1 s', () => {
    const small = make('skull', 0.2, 540, 960)
    const big = make('skull', 0.2, 1080, 1920)
    const ds = simulate(small, 1000, 60, 960, 540).x - small.x
    const db = simulate(big, 1000, 60, 1920, 1080).x - big.x
    expect(db / ds).toBeCloseTo(2, 5)
  })
})

describe('stage 1 pacing', () => {
  it('a ghost crosses a 1080p screen in 4–6 s', () => {
    const mult = STAGES[0].speedMultiplier
    const g = createGhost(W, H, mult)
    // Pin the spawn to the left edge, mid-height, and aim at the exact centre.
    let cur: Enemy[] = [{ ...g, x: -40, y: H / 2, targetX: W / 2, targetY: H / 2, sineOffset: 0 }]
    let ms = 0
    while (ms < 20_000) {
      cur = moveEnemies(cur, 1000 / 60, W, H)
      ms += 1000 / 60
      if (Math.hypot(cur[0].x - W / 2, cur[0].y - H / 2) <= 40) break
    }
    expect(ms / 1000).toBeGreaterThan(4)
    expect(ms / 1000).toBeLessThan(6)
  })

  it('later stages are faster', () => {
    expect(STAGES[3].speedMultiplier).toBeGreaterThan(STAGES[0].speedMultiplier)
  })
})

describe('skull exit (feel-fix R2)', () => {
  // Parked at the target inside the screen so only the timer matters.
  const parked = (): Enemy => ({ ...make('skull', 0.15), x: W / 2 + 100, y: H / 2, targetX: W / 2 + 100, targetY: H / 2 })
  const run = (e: Enemy, ms: number) => simulate(e, ms, 60)

  it('is still on screen and not exiting at 3.9 s', () => {
    const s = run(parked(), 3900)
    expect(s.exiting).toBe(false)
  })

  it('starts exiting once 4 s on screen have elapsed', () => {
    const s = run(parked(), 4100)
    expect(s.exiting).toBe(true)
  })

  it('does not count time spent off screen', () => {
    const e = { ...make('skull', 0.0001), x: -500, targetX: -500 }
    const s = run(e, 6000)
    expect(s.onScreenMs).toBe(0)
    expect(s.exiting).toBe(false)
  })

  it('flies away from the centre and is culled once off screen', () => {
    let cur = [run(parked(), 4100)]
    expect(cullExitedEnemies(cur, W, H)).toHaveLength(1)
    let ms = 0
    while (cur.length && ms < 10_000) {
      cur = cullExitedEnemies(moveEnemies(cur, 1000 / 60, W, H), W, H)
      ms += 1000 / 60
    }
    expect(cur).toHaveLength(0)
    expect(ms).toBeLessThan(6000)
  })

  it('never culls non-skull enemies or non-exiting skulls', () => {
    const far = { ...make('skull', 0.1), x: -999, hitbox: { x: -999, y: 0, w: 10, h: 10 } }
    const ghost = { ...make('ghost', 0.1), hitbox: { x: -999, y: 0, w: 10, h: 10 } }
    expect(cullExitedEnemies([far, ghost], W, H)).toHaveLength(2)
  })

  it('a leaving skull does not block a new skull spawn', () => {
    const leaving = { ...parked(), exiting: true }
    let s: GameState = { ...createInitialState(3), phase: 'playing', enemies: [leaving],
      spawnTimers: { ghost: 99999, bat: 99999, skull: 0, lunger: 99999, pumpkin: 99999 } }
    s = tickSpawners(s, 16, W, H)
    expect(s.enemies.filter((e) => e.type === 'skull' && !e.exiting)).toHaveLength(1)
    // …but a second non-exiting skull still never appears.
    s = { ...s, spawnTimers: { ...s.spawnTimers, skull: 0 } }
    s = tickSpawners(s, 16, W, H)
    expect(s.enemies.filter((e) => e.type === 'skull' && !e.exiting)).toHaveLength(1)
  })
})
