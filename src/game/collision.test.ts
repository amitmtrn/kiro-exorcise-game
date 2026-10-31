import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveHits } from './collision'
import { createInitialState } from './state'
import type { Enemy } from './state'

// Mock the diff module so we can control hit/no-hit per test
vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(),
  DIFF_THRESHOLD: 30,
  HIT_RATIO: 0.15,
  SAMPLE_STRIDE: 4,
}))

import { computeFrameDiff } from '../webcam/diff'

const mockDiff = computeFrameDiff as ReturnType<typeof vi.fn>

function makeEnemy(type: Enemy['type'], id = 'e1'): Enemy {
  return {
    id,
    type,
    x: 320, y: 240,
    targetX: 320, targetY: 240,
    speed: 1,
    sineOffset: 0,
    hitbox: { x: 280, y: 200, w: 80, h: 80 },
  }
}

const FAKE_IMAGE_DATA = {} as ImageData
const NOW = 1000

beforeEach(() => {
  mockDiff.mockReset()
})

describe('resolveHits', () => {
  it('does nothing when no enemies are hit', () => {
    mockDiff.mockReturnValue(false)
    const s = { ...createInitialState(), enemies: [makeEnemy('ghost')] }
    const result = resolveHits(s, FAKE_IMAGE_DATA, FAKE_IMAGE_DATA, 640, NOW)
    expect(result.enemies).toHaveLength(1)
    expect(result.score).toBe(0)
  })

  it('removes ghost, adds 100 points, spawns particles on hit', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [makeEnemy('ghost')] }
    const result = resolveHits(s, FAKE_IMAGE_DATA, FAKE_IMAGE_DATA, 640, NOW)
    expect(result.enemies).toHaveLength(0)
    expect(result.score).toBe(100)
    expect(result.particles.length).toBeGreaterThan(0)
  })

  it('removes bat, adds 50 points on hit', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [makeEnemy('bat')] }
    const result = resolveHits(s, FAKE_IMAGE_DATA, FAKE_IMAGE_DATA, 640, NOW)
    expect(result.enemies).toHaveLength(0)
    expect(result.score).toBe(50)
    expect(result.particles.length).toBeGreaterThan(0)
  })

  it('removes skull, decrements life, sets flash on hit', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [makeEnemy('skull')] }
    const result = resolveHits(s, FAKE_IMAGE_DATA, FAKE_IMAGE_DATA, 640, NOW)
    expect(result.enemies).toHaveLength(0)
    expect(result.lives).toBe(2)
    expect(result.flashEndTime).toBe(NOW + 300)
    expect(result.score).toBe(0)
  })

  it('handles multiple enemies in one frame — only hit ones are resolved', () => {
    mockDiff
      .mockReturnValueOnce(true)   // ghost → hit
      .mockReturnValueOnce(false)  // bat → miss

    const s = {
      ...createInitialState(),
      enemies: [makeEnemy('ghost', 'g1'), makeEnemy('bat', 'b1')],
    }
    const result = resolveHits(s, FAKE_IMAGE_DATA, FAKE_IMAGE_DATA, 640, NOW)
    expect(result.enemies).toHaveLength(1)
    expect(result.enemies[0].id).toBe('b1')
    expect(result.score).toBe(100)
  })
})
