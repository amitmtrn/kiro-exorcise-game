import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveHits } from './collision'
import { createInitialState } from './state'
import type { Enemy } from './state'

vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(),
  scaleHitbox: vi.fn((hb: unknown) => hb),   // identity — return hitbox as-is
  DIFF_THRESHOLD: 30,
  HIT_RATIO: 0.15,
  SAMPLE_STRIDE: 4,
  MOTION_W: 320,
  MOTION_H: 180,
}))

import { computeFrameDiff } from '../webcam/diff'
const mockDiff = computeFrameDiff as ReturnType<typeof vi.fn>

const DISPLAY_W = 640
const DISPLAY_H = 480
const FAKE = {} as ImageData

function makeEnemy(type: Enemy['type'], id = 'e1', overrides: Partial<Enemy> = {}): Enemy {
  return {
    id,
    type,
    x: 320, y: 240,
    targetX: 320, targetY: 240,
    speed: 1,
    sineOffset: 0,
    hitbox: { x: 280, y: 200, w: 80, h: 80 },
    spawnedAt: 0,      // long ago — no grace
    hitCount: 0,
    ...overrides,
  }
}

beforeEach(() => mockDiff.mockReset())

describe('resolveHits — basic', () => {
  it('does nothing when no enemies are hit', () => {
    mockDiff.mockReturnValue(false)
    const s = { ...createInitialState(), enemies: [makeEnemy('ghost')] }
    const result = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, 1000)
    expect(result.enemies).toHaveLength(1)
    expect(result.score).toBe(0)
  })

  it('requires 2 consecutive frames — first frame does not score', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [makeEnemy('ghost', 'g1', { hitCount: 0 })] }
    const result = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, 1000)
    // hitCount goes 0→1, not yet ≥ 2
    expect(result.enemies).toHaveLength(1)
    expect(result.score).toBe(0)
    expect(result.enemies[0].hitCount).toBe(1)
  })

  it('fires hit on second consecutive true frame', () => {
    mockDiff.mockReturnValue(true)
    // hitCount already 1 from last frame
    const s = { ...createInitialState(), enemies: [makeEnemy('ghost', 'g1', { hitCount: 1 })] }
    const result = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, 1000)
    expect(result.enemies).toHaveLength(0)
    expect(result.score).toBe(100)
  })

  it('resets hitCount to 0 when diff returns false', () => {
    mockDiff.mockReturnValue(false)
    const s = { ...createInitialState(), enemies: [makeEnemy('ghost', 'g1', { hitCount: 1 })] }
    const result = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, 1000)
    expect(result.enemies[0].hitCount).toBe(0)
    expect(result.score).toBe(0)
  })
})

describe('resolveHits — spawn grace period', () => {
  it('skips diff check during spawn grace (first 300 ms)', () => {
    mockDiff.mockReturnValue(true)
    const now = 1000
    // spawnedAt = now - 100 → only 100 ms old → still in grace
    const s = { ...createInitialState(), enemies: [makeEnemy('ghost', 'g1', { spawnedAt: now - 100, hitCount: 1 })] }
    const result = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, now)
    expect(result.enemies).toHaveLength(1)
    expect(result.score).toBe(0)
    expect(mockDiff).not.toHaveBeenCalled()
  })

  it('allows hits after grace period expires', () => {
    mockDiff.mockReturnValue(true)
    const now = 1000
    // spawnedAt = now - 400 → 400 ms old → grace expired
    const s = { ...createInitialState(), enemies: [makeEnemy('ghost', 'g1', { spawnedAt: now - 400, hitCount: 1 })] }
    const result = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, now)
    expect(result.enemies).toHaveLength(0)
    expect(result.score).toBe(100)
  })
})

describe('resolveHits — per enemy type (2-frame gate, hitCount pre-set to 1)', () => {
  it('ghost: removes + 100 pts + particles', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [makeEnemy('ghost', 'g1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, 1000)
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBe(100)
    expect(r.particles.length).toBeGreaterThan(0)
  })

  it('bat: removes + 50 pts + particles', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [makeEnemy('bat', 'b1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, 1000)
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBe(50)
    expect(r.particles.length).toBeGreaterThan(0)
  })

  it('skull: removes + life lost + flash', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [makeEnemy('skull', 's1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, 1000)
    expect(r.enemies).toHaveLength(0)
    expect(r.lives).toBe(2)
    expect(r.flashEndTime).toBe(1000 + 300)
    expect(r.score).toBe(0)
  })

  it('only hit enemies are resolved; others kept', () => {
    mockDiff
      .mockReturnValueOnce(true)   // ghost → 2nd frame hit
      .mockReturnValueOnce(false)  // bat → miss
    const s = {
      ...createInitialState(),
      enemies: [
        makeEnemy('ghost', 'g1', { hitCount: 1 }),
        makeEnemy('bat', 'b1', { hitCount: 0 }),
      ],
    }
    const r = resolveHits(s, FAKE, FAKE, DISPLAY_W, DISPLAY_H, 1000)
    expect(r.enemies).toHaveLength(1)
    expect(r.enemies[0].id).toBe('b1')
    expect(r.score).toBe(100)
  })
})
