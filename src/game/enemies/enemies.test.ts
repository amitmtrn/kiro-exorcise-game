import { describe, it, expect } from 'vitest'
import { createGhost, GHOST_SIZE } from './ghost'
import { createBat, BAT_W, BAT_H } from './bat'
import { createSkull, SKULL_SIZE } from './skull'
import { moveEnemies } from './movement'
import { tickSpawners, MAX_ENEMIES } from './spawn'
import { createInitialState } from '../state'

const W = 640
const H = 480

// ─── Spawn position helpers ───────────────────────────────────────────────────

describe('createGhost', () => {
  it('spawns outside canvas bounds', () => {
    for (let i = 0; i < 20; i++) {
      const g = createGhost(W, H)
      const outsideX = g.x < -GHOST_SIZE / 2 || g.x > W + GHOST_SIZE / 2
      const outsideY = g.y < -GHOST_SIZE / 2 || g.y > H + GHOST_SIZE / 2
      expect(outsideX || outsideY).toBe(true)
    }
  })

  it('has type ghost', () => {
    expect(createGhost(W, H).type).toBe('ghost')
  })

  it('hitbox dimensions match GHOST_SIZE', () => {
    const g = createGhost(W, H)
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
      // Enemy center is placed at ±margin outside each edge
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
  it('moves an enemy closer to its target', () => {
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

// ─── Spawn ticker ─────────────────────────────────────────────────────────────

describe('tickSpawners', () => {
  it('spawns a ghost when ghost timer fires and cap not reached', () => {
    let s = createInitialState()
    // Force ghost timer to fire immediately
    s = { ...s, spawnTimers: { ...s.spawnTimers, ghost: 0 } }
    const next = tickSpawners(s, 16, W, H)
    const ghosts = next.enemies.filter((e) => e.type === 'ghost')
    expect(ghosts.length).toBeGreaterThanOrEqual(1)
  })

  it('does not exceed MAX_ENEMIES cap', () => {
    // Fill enemies to cap
    let s = createInitialState()
    const dummyEnemies = Array.from({ length: MAX_ENEMIES }, (_, i) => ({
      ...createGhost(W, H),
      id: `e${i}`,
    }))
    s = { ...s, enemies: dummyEnemies, spawnTimers: { ghost: 0, bat: 0, skull: 0 } }
    const next = tickSpawners(s, 16, W, H)
    expect(next.enemies.length).toBeLessThanOrEqual(MAX_ENEMIES)
  })

  it('never spawns more than one skull at a time', () => {
    let s = createInitialState()
    s = { ...s, spawnTimers: { ghost: 99999, bat: 99999, skull: 0 } }
    // Run multiple ticks
    for (let i = 0; i < 10; i++) {
      s = tickSpawners(s, 16, W, H)
      s = { ...s, spawnTimers: { ...s.spawnTimers, skull: 0 } }
    }
    const skulls = s.enemies.filter((e) => e.type === 'skull')
    expect(skulls.length).toBeLessThanOrEqual(1)
  })
})
