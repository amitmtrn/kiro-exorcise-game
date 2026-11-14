/** A skull in its spawn grace costs nothing (playtest2-fixes R3.3). */
import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { resolveHits } from './collision'
import { createInitialState, makeEnemy } from './state'

vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(() => true), scaleHitbox: vi.fn((hb: unknown) => hb),
  DIFF_THRESHOLD: 30, HIT_RATIO: 0.15, SAMPLE_STRIDE: 4, MOTION_W: 320, MOTION_H: 180,
}))
vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxSkullHit: vi.fn(), sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(), sfxCombo: vi.fn(),
}))

const FAKE = {} as ImageData
const skull = (graceMs: number) => makeEnemy({
  id: 's', type: 'skull', x: 100, y: 200, targetX: 100, targetY: 200, speed: 0,
  hitbox: { x: 66, y: 166, w: 68, h: 68 }, spawnedAt: 0, hitCount: 1, graceMs,
})

describe('skull spawn grace', () => {
  it('a hit on a skull in its grace costs nothing and leaves it on screen', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 1, max: 6 }), (g, flash) => {
      const s = { ...createInitialState(), lives: 3, flashEndTime: 0, enemies: [skull(g)] }
      const r = resolveHits(s, FAKE, FAKE, 640, 480, 10_000 + flash)
      expect(r.lives).toBe(3)
      expect(r.phase).toBe(s.phase)
      expect(r.enemies).toHaveLength(1)
      expect(r.flashEndTime).toBe(0)
    }), { numRuns: 100 })
  })

  it('after the grace the skull costs a heart as before', () => {
    const r = resolveHits({ ...createInitialState(), lives: 3, enemies: [skull(0)] }, FAKE, FAKE, 640, 480, 10_000)
    expect(r.lives).toBe(2)
    expect(r.enemies).toHaveLength(0)
  })
})
