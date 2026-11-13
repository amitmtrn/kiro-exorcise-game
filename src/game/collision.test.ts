import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveHits, lastBanished, updateMotionPixels, lastMotionPixels } from './collision'
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

vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxSkullHit: vi.fn(),
  sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(), sfxCombo: vi.fn(),
}))

import { computeFrameDiff } from '../webcam/diff'
import { sfxCombo } from '../audio/sfx'
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

beforeEach(() => { mockDiff.mockReset(); (sfxCombo as ReturnType<typeof vi.fn>).mockClear() })

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
    const s = { ...createInitialState(), streak: 2, combo: 1, enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.streak).toBe(3)
    expect(r.combo).toBe(2)
    expect(r.score).toBe(100) // scored at the pre-increment multiplier
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
  it('a hit that brings the streak to 3 sets shakeFrames', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), streak: 2, combo: 1, enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.streak).toBe(3)
    expect(r.shakeFrames).toBe(SHAKE_FRAMES)
  })

  it('a hit below streak 3 does not shake', () => {
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

describe('resolveHits — time-based hit flash and game over (pbt BUG-3, BUG-4)', () => {
  it('a hit flash lasts one frame at 60 fps (16 and 16.67 ms) but is not extended at 144 Hz beyond ~3 frames', () => {
    for (const ms of [16, 1000 / 60]) {
      mockDiff.mockReturnValue(true)
      const s = { ...createInitialState(), enemies: [enemy('pumpkin', 'p1', { hitCount: 1, hitsReceived: 0, hitsNeeded: 2 })] }
      const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000, true, ms)
      expect(r.enemies[0].hitFlashFrames).toBe(1)
      mockDiff.mockReturnValue(false)
      expect(resolveHits(r, FAKE, FAKE, DW, DH, 1016, true, ms).enemies[0].hitFlashFrames).toBe(0)
    }
    mockDiff.mockReturnValue(true)
    let r = resolveHits({ ...createInitialState(), enemies: [enemy('pumpkin', 'p1', { hitCount: 1, hitsReceived: 0, hitsNeeded: 2 })] }, FAKE, FAKE, DW, DH, 1000)
    mockDiff.mockReturnValue(false)
    let ticks = 0
    while (r.enemies[0].hitFlashFrames > 0 && ticks < 20) { r = resolveHits(r, FAKE, FAKE, DW, DH, 1000, true, 1000 / 144); ticks++ }
    expect(ticks).toBeLessThanOrEqual(3)
  })

  it('a hit flash lasts one tick at 30 fps and expires on duplicate camera frames too', () => {
    mockDiff.mockReturnValue(false)
    const flashing = { ...createInitialState(), enemies: [enemy('ghost', 'g1', { hitFlashFrames: 1 })] }
    expect(resolveHits(flashing, FAKE, FAKE, DW, DH, 1000, false, 33).enemies[0].hitFlashFrames).toBe(0)
  })

  it('does nothing in the gameover phase', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), phase: 'gameover' as const, lives: 0, enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    expect(resolveHits(s, FAKE, FAKE, DW, DH, 1000)).toBe(s)
    expect(lastBanished).toHaveLength(0)
  })

  it('enemies after a skull that takes the last life do not score', () => {
    mockDiff.mockReturnValue(true)
    const s = {
      ...createInitialState(), phase: 'playing' as const, lives: 1,
      enemies: [enemy('skull', 's1', { hitCount: 1 }), enemy('ghost', 'g1', { hitCount: 1 })],
    }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.phase).toBe('gameover')
    expect(r.score).toBe(0)
    expect(r.enemies.map((e) => e.id)).toEqual(['g1'])
  })
})

describe('resolveHits — score pop labels (spooky-skin R5.2)', () => {
  it('a ghost hit spawns a "+100" label at the ghost', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('ghost', 'g1', { hitCount: 1, x: 200, y: 150 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.scoreLabels).toHaveLength(1)
    expect(r.scoreLabels[0].text).toBe('+100')
    expect(r.scoreLabels[0].x).toBe(200)
    expect(r.scoreLabels[0].y).toBeLessThan(150)
  })

  it('label shows the combo-multiplied points', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), combo: 3, enemies: [enemy('bat', 'b1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.scoreLabels[0].text).toBe('+150')
  })

  it('a skull hit spawns no label', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('skull', 's1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.scoreLabels).toHaveLength(0)
  })
})

describe('resolveHits — duplicate camera frames (30 fps webcam under a 60 fps loop)', () => {
  it('frameIsNew=false leaves the 2-frame gate counter untouched and skips the diff', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000, false)
    expect(mockDiff).not.toHaveBeenCalled()
    expect(r.enemies).toHaveLength(1)
    expect(r.enemies[0].hitCount).toBe(1)
    expect(r.score).toBe(0)
  })

  it('motion on two new frames with a duplicate in between still confirms the hit', () => {
    mockDiff.mockReturnValue(true)
    let s = { ...createInitialState(), enemies: [enemy('ghost', 'g1', { hitCount: 0 })] }
    s = resolveHits(s, FAKE, FAKE, DW, DH, 1000, true)   // new frame, motion → hitCount 1
    s = resolveHits(s, FAKE, FAKE, DW, DH, 1016, false)  // duplicate frame → untouched
    expect(s.enemies[0].hitCount).toBe(1)
    s = resolveHits(s, FAKE, FAKE, DW, DH, 1033, true)   // new frame, motion → hit
    expect(s.enemies).toHaveLength(0)
    expect(s.score).toBe(100)
  })

  it('frameIsNew=false still lets a hit flash expire and clears lastBanished', () => {
    mockDiff.mockReturnValue(true)
    let s = { ...createInitialState(), enemies: [enemy('pumpkin', 'p1', { hitCount: 1, hitsReceived: 0, hitsNeeded: 2 })] }
    s = resolveHits(s, FAKE, FAKE, DW, DH, 1000, true)
    expect(s.enemies[0].hitFlashFrames).toBe(1)
    s = resolveHits(s, FAKE, FAKE, DW, DH, 1016, false)
    expect(s.enemies[0].hitFlashFrames).toBe(0)
    expect(lastBanished).toHaveLength(0)
  })
})

describe('updateMotionPixels — whole-frame mask published in display space', () => {
  it('scales motion-canvas points to display coordinates', () => {
    updateMotionPixels({ points: [{ x: 160, y: 90 }], sampled: 1, moved: 1, changed: true }, 1280, 720)
    expect(lastMotionPixels).toEqual([{ x: 640, y: 360 }])
  })

  it('keeps the previous pixels on a duplicate camera frame', () => {
    updateMotionPixels({ points: [{ x: 32, y: 18 }], sampled: 1, moved: 1, changed: true }, 640, 360)
    updateMotionPixels({ points: [], sampled: 1, moved: 0, changed: false }, 640, 360)
    expect(lastMotionPixels).toEqual([{ x: 64, y: 36 }])
  })

  it('clears pixels on a new frame with no motion', () => {
    updateMotionPixels({ points: [{ x: 32, y: 18 }], sampled: 1, moved: 1, changed: true }, 640, 360)
    updateMotionPixels({ points: [], sampled: 1, moved: 0, changed: true }, 640, 360)
    expect(lastMotionPixels).toEqual([])
  })
})

describe('resolveHits — feel-fix review fixes', () => {
  it('a skull hit leaves streak and combo unchanged (R3.2)', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), streak: 7, combo: 3, enemies: [enemy('skull', 's1', { hitCount: 1 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.streak).toBe(7)
    expect(r.combo).toBe(3)
  })

  it('hitting an exiting skull still costs a life (R2.4)', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('skull', 's1', { hitCount: 1, exiting: true })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.lives).toBe(2)
  })

  it('combo chime plays only when the multiplier tier rises', () => {
    mockDiff.mockReturnValue(true)
    const fn = sfxCombo as ReturnType<typeof vi.fn>
    const hit = (streak: number, combo: number) =>
      resolveHits({ ...createInitialState(), streak, combo, enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }, FAKE, FAKE, DW, DH, 1000)
    hit(0, 1)
    expect(fn).not.toHaveBeenCalled()
    hit(2, 1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(2)
  })
})
