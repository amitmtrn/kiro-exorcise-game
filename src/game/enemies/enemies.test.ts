import { describe, it, expect } from 'vitest'
import { createGhost, GHOST_SIZE } from './ghost'
import { createBat, BAT_W, BAT_H } from './bat'
import { createSkull, SKULL_SIZE } from './skull'
import { createLunger } from './lunger'
import { moveEnemies } from './movement'
import { tickSpawners } from './spawn'
import { createInitialState, makeEnemy } from '../state'
import type { GameState } from '../state'

const W = 640
const H = 480
const gs = (o: Partial<GameState>): GameState => ({ ...createInitialState(), ...o }) as GameState

// ─── Factory tests ────────────────────────────────────────────────────────────

describe('createGhost', () => {
  it('spawns outside canvas bounds', () => {
    for (let i = 0; i < 20; i++) {
      const g = createGhost(W, H)
      const outsideX = g.x < -GHOST_SIZE / 2 || g.x > W + GHOST_SIZE / 2
      const outsideY = g.y < -GHOST_SIZE / 2 || g.y > H + GHOST_SIZE / 2
      expect(outsideX || outsideY).toBe(true)
    }
  })

  it('has type ghost and hitbox dimensions match GHOST_SIZE', () => {
    const g = createGhost(W, H)
    expect(g.type).toBe('ghost')
    expect(g.hitbox.w).toBe(GHOST_SIZE)
    expect(g.hitbox.h).toBe(GHOST_SIZE)
  })

  it('initialises spawnedAt as a number and hitCount as 0', () => {
    const g = createGhost(W, H)
    expect(typeof g.spawnedAt).toBe('number')
    expect(g.hitCount).toBe(0)
  })
})

describe('createBat', () => {
  it('spawns outside canvas bounds', () => {
    for (let i = 0; i < 20; i++) {
      const b = createBat(W, H)
      const outsideX = b.x < 0 || b.x > W
      const outsideY = b.y < 0 || b.y > H
      expect(outsideX || outsideY).toBe(true)
    }
  })

  it('has hitbox matching BAT dimensions', () => {
    const b = createBat(W, H)
    expect(b.hitbox.w).toBe(BAT_W)
    expect(b.hitbox.h).toBe(BAT_H)
  })
})

describe('createSkull', () => {
  it('spawns outside canvas bounds', () => {
    for (let i = 0; i < 20; i++) {
      const s = createSkull(W, H)
      const outsideX = s.x < -SKULL_SIZE / 2 || s.x > W + SKULL_SIZE / 2
      const outsideY = s.y < -SKULL_SIZE / 2 || s.y > H + SKULL_SIZE / 2
      expect(outsideX || outsideY).toBe(true)
    }
  })
})

// ─── Movement ─────────────────────────────────────────────────────────────────

describe('moveEnemies', () => {
  it('moves a ghost closer to its target', () => {
    const ghost = createGhost(W, H)
    const before = Math.hypot(ghost.targetX - ghost.x, ghost.targetY - ghost.y)
    const [moved] = moveEnemies([ghost], 16)
    const after = Math.hypot(moved.targetX - moved.x, moved.targetY - moved.y)
    expect(after).toBeLessThan(before)
  })

  it('returns a new array without mutating the original', () => {
    const ghost = createGhost(W, H)
    const original = ghost.x
    moveEnemies([ghost], 16)
    expect(ghost.x).toBe(original)
  })

  it('updates hitbox to reflect new position (hitbox is 20% enlarged)', () => {
    const ghost = createGhost(W, H)
    const [moved] = moveEnemies([ghost], 16)
    const enlargedHalf = (GHOST_SIZE * 1.2) / 2
    expect(moved.hitbox.x).toBeCloseTo(moved.x - enlargedHalf, 0)
    expect(moved.hitbox.y).toBeCloseTo(moved.y - enlargedHalf, 0)
  })
})

// ─── Lunger phase machine ─────────────────────────────────────────────────────

describe('lunger movement', () => {
  it('starts in approach phase', () => {
    const l = createLunger(W, H)
    expect(l.movePhase).toBe('approach')
  })

  it('transitions to windup when close enough to center', () => {
    // Place lunger very close to its target (within LUNGER_HOLD_DIST)
    const l = makeEnemy({
      id: 'l1', type: 'lunger',
      x: 320, y: 240,
      targetX: 320, targetY: 280, // 40px away — well within hold dist
      speed: 1,
      hitbox: { x: 284, y: 204, w: 72, h: 72 },
      movePhase: 'approach',
      phaseTimer: 0,
    })
    const [moved] = moveEnemies([l], 16)
    expect(moved.movePhase).toBe('windup')
    expect(moved.phaseTimer).toBeGreaterThan(0)
  })

  it('transitions from windup to lunge when timer expires', () => {
    const l = makeEnemy({
      id: 'l1', type: 'lunger',
      x: 320, y: 200,
      targetX: 320, targetY: 240,
      speed: 1,
      hitbox: { x: 284, y: 164, w: 72, h: 72 },
      movePhase: 'windup',
      phaseTimer: 50, // almost done
    })
    const [moved] = moveEnemies([l], 100) // 100ms > 50ms timer
    expect(moved.movePhase).toBe('lunge')
  })

  it('moves faster in lunge phase', () => {
    const l = makeEnemy({
      id: 'l1', type: 'lunger',
      x: 0, y: 0,
      targetX: 640, targetY: 480,
      speed: 1,
      hitbox: { x: -36, y: -36, w: 72, h: 72 },
      movePhase: 'lunge',
      phaseTimer: 0,
    })
    const normalL = { ...l, movePhase: 'approach' as const }
    const [lunged] = moveEnemies([l], 16)
    const [approached] = moveEnemies([normalL], 16)
    const lDist = Math.hypot(lunged.x, lunged.y)
    const aDist = Math.hypot(approached.x, approached.y)
    expect(lDist).toBeGreaterThan(aDist)
  })
})

// ─── Spawn ticker ─────────────────────────────────────────────────────────────

describe('tickSpawners', () => {
  it('spawns a ghost when ghost timer fires and phase is playing', () => {
    const s = gs({ stage: 1, phase: 'playing', spawnTimers: { ...createInitialState().spawnTimers, ghost: 0 } })
    const next = tickSpawners(s, 16, W, H)
    expect(next.enemies.filter((e) => e.type === 'ghost').length).toBeGreaterThanOrEqual(1)
  })

  it('does not spawn when phase is not playing', () => {
    const s = gs({ stage: 1, phase: 'stageTitle', spawnTimers: { ...createInitialState().spawnTimers, ghost: 0 } })
    expect(tickSpawners(s, 16, W, H).enemies).toHaveLength(0)
  })

  it('never spawns more than one skull at a time', () => {
    let s = gs({ stage: 3, phase: 'playing',
      spawnTimers: { ghost: 99999, bat: 99999, skull: 0, lunger: 99999, pumpkin: 99999 } })
    for (let i = 0; i < 10; i++) {
      s = tickSpawners(s, 16, W, H)
      s = { ...s, spawnTimers: { ...s.spawnTimers, skull: 0 } }
    }
    expect(s.enemies.filter((e) => e.type === 'skull').length).toBeLessThanOrEqual(1)
  })

  it('respects stage enemy mix (stage 1 has no bats)', () => {
    let s = gs({ stage: 1, phase: 'playing',
      spawnTimers: { ghost: 0, bat: 0, skull: 0, lunger: 0, pumpkin: 0 } })
    for (let i = 0; i < 20; i++) s = tickSpawners(s, 16, W, H)
    expect(s.enemies.filter((e) => e.type === 'bat').length).toBe(0)
  })
})
