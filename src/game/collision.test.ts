import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveHits, lastBanished } from './collision'
import { createInitialState, makeEnemy, SHAKE_FRAMES } from './state'
import type { Enemy } from './state'

vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(),
  scaleHitbox: vi.fn((hb: unknown) => hb),
  DIFF_THRESHOLD: 30,
  HIT_RATIO: 0.15,
  SAMPLE_STRIDE: 4,
  MOTION_W: 320,
  MOTION_H: 180,
}))

import { computeFrameDiff } from '../webcam/diff'
const mockDiff = computeFrameDiff as ReturnType<typeof vi.fn>

const DW = 640, DH = 480
const FAKE = {} as ImageData

function enemy(type: Enemy['type'], id = 'e1', overrides: Partial<Enemy> = {}): Enemy {
  return makeEnemy({
    id, type,
    x: 320, y: 240,
    targetX: 320, targetY: 240,
    speed: 1,
    hitbox: { x: 280, y: 200, w: 80, h: 80 },
    spawnedAt: 0,
    hitCount: 0,
    ...overrides,
  })
}

beforeEach(() => mockDiff.mockReset())

describe('resolveHits — 2-frame gate', () => {
  it('does not fire on first true frame', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('ghost', 'g1', { hitCount: 0 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(1)
    expect(r.score).toBe(0)
  })

  it('fires on second consecutive true frame', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBe(100) // 100 * combo(1)
  })
})

describe('resolveHits — spawn grace', () => {
  it('skips hit during grace period', () => {
    mockDiff.mockReturnValue(true)
    const now = 1000
    const s = { ...createInitialState(), enemies: [enemy('ghost', 'g1', { spawnedAt: now - 100, hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, now)
    expect(r.enemies).toHaveLength(1)
    expect(mockDiff).not.toHaveBeenCalled()
  })
})

describe('resolveHits — combo multiplier', () => {
  it('ghost scores 100 * combo', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), combo: 3, enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.score).toBe(300)
  })

  it('increments combo on ghost hit', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), combo: 2, enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.combo).toBe(3)
  })

  it('bat scores 50 * combo', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), combo: 2, enemies: [enemy('bat', 'b1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.score).toBe(100)
  })
})

describe('resolveHits — skull penalty', () => {
  it('skull hit loses a life, sets flash, does not score', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('skull', 's1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.lives).toBe(2)
    expect(r.flashEndTime).toBe(1300)
    expect(r.score).toBe(0)
  })
})

describe('resolveHits — pumpkin 2-hit', () => {
  it('first hit keeps pumpkin alive with hitsReceived=1', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('pumpkin', 'p1', { hitCount: 1, hitsReceived: 0, hitsNeeded: 2 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(1)
    expect(r.enemies[0].hitsReceived).toBe(1)
    expect(r.score).toBe(0)
  })

  it('second hit banishes pumpkin and scores', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('pumpkin', 'p1', { hitCount: 1, hitsReceived: 1, hitsNeeded: 2 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBe(200) // 200 * combo(1)
  })
})

describe('resolveHits — boss multi-hit', () => {
  it('boss survives until hitsNeeded', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('boss', 'b1', { hitCount: 1, bossHitsReceived: 5, hitsNeeded: 10 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(1)
    expect(r.enemies[0].bossHitsReceived).toBe(6)
  })

  it('boss is removed on final hit and scores 1000', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('boss', 'b1', { hitCount: 1, bossHitsReceived: 9, hitsNeeded: 10 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBe(1000)
  })
})

describe('resolveHits — screen shake (spooky-skin R4.1)', () => {
  it('a hit that brings combo to 3 sets shakeFrames', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), combo: 2, enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.combo).toBe(3)
    expect(r.shakeFrames).toBe(SHAKE_FRAMES)
  })

  it('a hit below combo 3 does not shake', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), combo: 1, enemies: [enemy('bat', 'b1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.shakeFrames).toBe(0)
  })

  it('a skull hit never shakes', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), combo: 5, enemies: [enemy('skull', 's1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.shakeFrames).toBe(0)
  })
})

describe('resolveHits — 1-frame white hit flash (spooky-skin R4.2)', () => {
  it('records a banished ghost in lastBanished with hitFlashFrames = 1', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(0)
    expect(lastBanished).toHaveLength(1)
    expect(lastBanished[0].id).toBe('g1')
    expect(lastBanished[0].hitFlashFrames).toBe(1)
  })

  it('clears lastBanished on the next call', () => {
    mockDiff.mockReturnValue(true)
    resolveHits({ ...createInitialState(), enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }, FAKE, FAKE, DW, DH, 1000)
    expect(lastBanished).toHaveLength(1)
    mockDiff.mockReturnValue(false)
    resolveHits(createInitialState(), FAKE, FAKE, DW, DH, 1016)
    expect(lastBanished).toHaveLength(0)
  })

  it('a surviving pumpkin flashes for one frame after its first hit', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('pumpkin', 'p1', { hitCount: 1, hitsReceived: 0, hitsNeeded: 2 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies[0].hitFlashFrames).toBe(1)

    // Next frame with no motion: flash expires, enemy stays
    mockDiff.mockReturnValue(false)
    const r2 = resolveHits(r, FAKE, FAKE, DW, DH, 1016)
    expect(r2.enemies).toHaveLength(1)
    expect(r2.enemies[0].hitFlashFrames).toBe(0)
  })

  it('a boss that survives a hit flashes for one frame', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('boss', 'b1', { hitCount: 1, bossHitsReceived: 0, hitsNeeded: 10 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies[0].hitFlashFrames).toBe(1)
  })
})
