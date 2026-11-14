import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveHits, lastBanished, lastSwipes, updateMotionPixels, lastMotionPixels } from './collision'
import { createInitialState, makeEnemy, tickTimer, SHAKE_FRAMES } from './state'
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

import { computeFrameDiff, scaleHitbox } from '../webcam/diff'
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

describe('resolveHits — boss phases (boss-phases R3.5, R6)', () => {
  const boss = (o: Partial<Enemy> = {}) =>
    enemy('boss', 'b1', { hitCount: 1, hitsNeeded: 10, ...o })

  it('a shielded boss (phase 2, idle) ignores motion and resets its hit gate', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [boss({ bossPhase: 2, bossAttack: 'idle', bossHitsReceived: 4 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies[0].bossHitsReceived).toBe(4)
    expect(r.enemies[0].hitCount).toBe(0)
  })

  it.each(['windup', 'lunge', 'recover'] as const)('a phase-2 boss in %s can be hit', (attack) => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [boss({ bossPhase: 2, bossAttack: attack, bossHitsReceived: 4 })] }
    expect(resolveHits(s, FAKE, FAKE, DW, DH, 1000).enemies[0].bossHitsReceived).toBe(5)
  })

  it('a boss in its post-hit cooldown ignores motion', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [boss({ bossInvulnMs: 200 })] }
    expect(resolveHits(s, FAKE, FAKE, DW, DH, 1000).enemies[0].bossHitsReceived).toBe(0)
  })

  it('the hit that crosses a phase threshold shakes the screen', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [boss({ bossHitsReceived: 3 })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies[0].bossPhase).toBe(2)
    expect(r.shakeFrames).toBeGreaterThan(0)
  })

  it('defeating the boss in stage 5 ends the game with victory, clears minions and keeps the total score', () => {
    mockDiff.mockReturnValue(true)
    const minion = enemy('ghost', 'g1', { hitCount: 0, x: 50, y: 50, hitbox: { x: 10, y: 10, w: 80, h: 80 } })
    mockDiff.mockImplementation((_c: unknown, _p: unknown, hb: { x: number }) => hb.x !== 10)
    const s = { ...createInitialState(5), phase: 'playing' as const, score: 2000, enemies: [minion, boss({ bossHitsReceived: 9, bossPhase: 3, bossAttack: 'recover' })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.phase).toBe('victory')
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBe(3000)
  })

  it('defeating a boss in an earlier stage goes to the summary', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(3), phase: 'playing' as const, enemies: [boss({ bossHitsReceived: 9, bossPhase: 3, bossAttack: 'recover' })] }
    expect(resolveHits(s, FAKE, FAKE, DW, DH, 1000).phase).toBe('summary')
  })

  it('losing the last life on the defeat frame is still game over', () => {
    mockDiff.mockReturnValue(true)
    const skull = enemy('skull', 's1', { hitCount: 1 })
    const s = { ...createInitialState(5), phase: 'playing' as const, lives: 1, enemies: [boss({ bossHitsReceived: 9, bossPhase: 3, bossAttack: 'recover' }), skull] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.phase).toBe('gameover')
    // the boss is left alive and unscored
    expect(r.enemies.some((e) => e.type === 'boss')).toBe(true)
    expect(r.score).toBe(0)
  })

  it('defeat on the same tick the timer would expire wins (R6.6)', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(5), phase: 'playing' as const, roundTimeMs: 10, enemies: [boss({ bossHitsReceived: 9, bossPhase: 3, bossAttack: 'recover' })] }
    const r = tickTimer(resolveHits(s, FAKE, FAKE, DW, DH, 1000), 16)
    expect(r.phase).toBe('victory')
  })
})

describe('resolveHits — lunger only hittable from wind-up (boss-phases R7.1)', () => {
  it('ignores an approaching lunger and resets its gate', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('lunger', 'l1', { hitCount: 1, movePhase: 'approach' })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(1)
    expect(r.enemies[0].hitCount).toBe(0)
    expect(r.score).toBe(0)
  })

  it.each(['windup', 'lunge'] as const)('banishes a lunger in %s for 150', (phase) => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('lunger', 'l1', { hitCount: 1, movePhase: phase })] }
    const r = resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBe(150)
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

describe('resolveHits — swipe estimation (juice R1)', () => {
  const MW = 320, MH = 300
  /** Black frame with a bright block at (bx, by). */
  function frame(bx: number, by = 120): ImageData {
    const data = new Uint8ClampedArray(MW * MH * 4)
    for (let y = by; y < by + 24; y++) for (let x = bx; x < bx + 24; x++) {
      const i = (y * MW + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
    }
    return { data, width: MW, height: MH } as ImageData
  }
  const box = { x: 100, y: 100, w: 120, h: 80 }
  const ghost = (o: Partial<Enemy> = {}) => enemy('ghost', 'g1', { x: 320, y: 280, hitbox: box, ...o })
  const swipeFrames = (xs: number[]) => xs.map((x) => frame(x))

  it('a hand moving right across two gate frames yields dx > 0 and a clean enemy', () => {
    mockDiff.mockReturnValue(true)
    const [f0, f1, f2] = swipeFrames([110, 140, 170])
    let s = { ...createInitialState(), enemies: [ghost()] }
    s = resolveHits(s, f1, f0, DW, DH, 1000)
    expect(s.enemies[0].motionX).toBeGreaterThan(0)
    expect(lastSwipes.size).toBe(0)
    s = resolveHits(s, f2, f1, DW, DH, 1016)
    const sw = lastSwipes.get('g1')!
    expect(sw.source).toBe('shift')
    expect(sw.dx).toBeGreaterThan(0.99)
    expect(s.enemies).toHaveLength(0)
  })

  it('a hand moving left yields dx < 0', () => {
    mockDiff.mockReturnValue(true)
    const [f0, f1, f2] = swipeFrames([170, 140, 110])
    let s = { ...createInitialState(), enemies: [ghost()] }
    s = resolveHits(s, f1, f0, DW, DH, 1000)
    resolveHits(s, f2, f1, DW, DH, 1016)
    expect(lastSwipes.get('g1')!.dx).toBeLessThan(-0.99)
  })

  it('a still frame breaks the swipe; a duplicate camera frame keeps it', () => {
    const [f0, f1] = swipeFrames([110, 140])
    mockDiff.mockReturnValue(true)
    let s = { ...createInitialState(), enemies: [ghost()] }
    s = resolveHits(s, f1, f0, DW, DH, 1000)
    const kept = resolveHits(s, f1, f1, DW, DH, 1010, false)
    expect(kept.enemies[0].motionX).toBe(s.enemies[0].motionX)
    mockDiff.mockReturnValue(false)
    const broken = resolveHits(s, f1, f1, DW, DH, 1016)
    expect(broken.enemies[0].motionX).toBeUndefined()
    expect(broken.enemies[0].hitCount).toBe(0)
  })

  it('without usable pixels the swipe falls back (radial / up) and stays unit length', () => {
    mockDiff.mockReturnValue(true)
    resolveHits({ ...createInitialState(), enemies: [ghost({ hitCount: 1 })] }, FAKE, FAKE, DW, DH, 1000)
    const sw = lastSwipes.get('g1')!
    expect(sw.source).toBe('default')
    expect(Math.hypot(sw.dx, sw.dy)).toBeCloseTo(1, 9)
  })
})

describe('resolveHits — knock-back (juice R2)', () => {
  const hit = (type: Enemy['type'], o: Partial<Enemy> = {}) => {
    mockDiff.mockReturnValue(true)
    return resolveHits({ ...createInitialState(), enemies: [enemy(type, 'e1', { hitCount: 1, ...o })] }, FAKE, FAKE, DW, DH, 1000)
  }

  it.each(['ghost', 'bat', 'candy', 'lunger'] as const)('a banished %s becomes a knock', (type) => {
    const r = hit(type, type === 'lunger' ? { movePhase: 'windup' } : {})
    expect(r.enemies).toHaveLength(0)
    expect(r.knocks).toHaveLength(1)
    expect(r.knocks[0].enemy.type).toBe(type)
    expect(r.knocks[0].enemy.hitFlashFrames).toBe(0)
    expect(r.knocks[0].ageMs).toBe(0)
  })

  it('the knock follows the recorded swipe (default: straight up)', () => {
    const r = hit('ghost')
    expect(r.knocks[0].ux).toBe(0)
    expect(r.knocks[0].uy).toBe(-1)
    expect(r.knocks[0].speed).toBeCloseTo(2.2 * DH, 6)
  })

  it('skulls and non-final pumpkin hits spawn no knock', () => {
    expect(hit('skull').knocks).toHaveLength(0)
    expect(hit('pumpkin', { hitsNeeded: 2, hitsReceived: 0 }).knocks).toHaveLength(0)
  })

  it('the final pumpkin hit and the boss defeat each spawn one', () => {
    expect(hit('pumpkin', { hitsNeeded: 2, hitsReceived: 1 }).knocks).toHaveLength(1)
    const r = hit('boss', { bossHitsReceived: 9, bossAttack: 'windup', bossPhase: 3, bossInvulnMs: 0 })
    expect(r.phase === 'summary' || r.phase === 'victory').toBe(true)
    expect(r.knocks).toHaveLength(1)
    expect(r.knocks[0].enemy.type).toBe('boss')
  })
})

describe('resolveHits — hit-stop (juice R3)', () => {
  const run = (type: Enemy['type'], base: Partial<ReturnType<typeof createInitialState>> = {}) => {
    mockDiff.mockReturnValue(true)
    return resolveHits({ ...createInitialState(), ...base, enemies: [enemy(type, 'e1', { hitCount: 1 })] }, FAKE, FAKE, DW, DH, 1000)
  }

  it('a banish freezes game time for 60 ms', () => {
    expect(run('ghost').hitStopMs).toBe(60)
    expect(run('bat').hitStopMs).toBe(60)
  })

  it('a longer remaining freeze is not shortened', () => {
    expect(run('ghost', { hitStopMs: 100 }).hitStopMs).toBe(100)
  })

  it('a skull (penalty) and a missed swipe do not freeze', () => {
    expect(run('skull').hitStopMs).toBe(0)
    mockDiff.mockReturnValue(false)
    const r = resolveHits({ ...createInitialState(), enemies: [enemy('ghost', 'e1', { hitCount: 1 })] }, FAKE, FAKE, DW, DH, 1000)
    expect(r.hitStopMs).toBe(0)
  })

  it('hit detection still runs while frozen (input is not blocked)', () => {
    const r = run('ghost', { hitStopMs: 40 })
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBeGreaterThan(0)
  })
})

describe('resolveHits — combo call-outs (juice R4)', () => {
  const hit = (streak: number, combo: number, type: Enemy['type'] = 'ghost') => {
    mockDiff.mockReturnValue(true)
    return resolveHits({ ...createInitialState(), streak, combo, enemies: [enemy(type, 'e1', { hitCount: 1 })] }, FAKE, FAKE, DW, DH, 1000)
  }
  const texts = (r: ReturnType<typeof hit>) => r.callouts.map((c) => c.text)

  it('no call-out at combo x1', () => {
    expect(hit(0, 1).callouts).toHaveLength(0)
    expect(hit(1, 1).callouts).toHaveLength(0)
  })

  it('tier-ups call out x2 / x3 / x4 COMBO!', () => {
    expect(texts(hit(2, 1))).toEqual(['x2 COMBO!'])
    expect(texts(hit(5, 2))).toEqual(['x3 COMBO!'])
    expect(texts(hit(9, 3))).toEqual(['x4 COMBO!'])
  })

  it('praise per tier', () => {
    expect(texts(hit(3, 2))).toEqual(['NICE!'])
    expect(texts(hit(7, 3))).toEqual(['GREAT!'])
    expect(texts(hit(11, 4))).toEqual(['PERFECT!'])
  })

  it('bats and candy count too; skulls never', () => {
    expect(texts(hit(2, 1, 'bat'))).toEqual(['x2 COMBO!'])
    expect(texts(hit(2, 1, 'candy'))).toEqual(['x2 COMBO!'])
    expect(hit(2, 1, 'skull').callouts).toHaveLength(0)
  })

  it('the call-out sits inside the canvas', () => {
    const c = hit(2, 1).callouts[0]
    expect(c.x).toBeGreaterThanOrEqual(DW * 0.15)
    expect(c.y).toBeGreaterThan(0)
  })
})

describe('resolveHits — motion width (two-player R1.3, R7.2)', () => {
  it('defaults to the full motion width: scaleHitbox gets no 4th argument, diff runs at 320', () => {
    mockDiff.mockReturnValue(false)
    const s = { ...createInitialState(), enemies: [enemy('ghost', 'g1')] }
    resolveHits(s, FAKE, FAKE, DW, DH, 1000)
    expect(mockDiff.mock.calls[0][3]).toBe(320)
    expect((scaleHitbox as ReturnType<typeof vi.fn>).mock.calls.slice(-1)[0]).toHaveLength(3)
  })

  it('motionW = 160 is passed to the hitbox scale and the frame diff', () => {
    mockDiff.mockReturnValue(false)
    const s = { ...createInitialState(), enemies: [enemy('ghost', 'g1')] }
    resolveHits(s, FAKE, FAKE, DW, DH, 1000, true, 16, 160)
    expect(mockDiff.mock.calls[0][3]).toBe(160)
    expect((scaleHitbox as ReturnType<typeof vi.fn>).mock.calls.slice(-1)[0]?.[3]).toBe(160)
  })

  it('a half-width call scores like a full-width call', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(), enemies: [enemy('ghost', 'g1', { hitCount: 1 })] }
    expect(resolveHits(s, FAKE, FAKE, DW, DH, 1000, true, 16, 160).score).toBe(100)
  })
})

import { GRID_STRIDE } from './collision'
import { SAMPLE_STRIDE } from '../webcam/diff'
describe('motion grid stride', () => {
  it('matches the frame-diff sample stride', () => {
    expect(GRID_STRIDE).toBe(SAMPLE_STRIDE)
  })
})
