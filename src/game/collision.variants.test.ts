import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveHits, lastBanished } from './collision'
import { createInitialState, makeEnemy } from './state'
import type { Enemy } from './state'
import { splitReached } from './enemies/reach'
import { stepVariant } from './enemies/variants'

vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(),
  scaleHitbox: vi.fn((hb: unknown) => hb),
  DIFF_THRESHOLD: 30, HIT_RATIO: 0.15, SAMPLE_STRIDE: 4, MOTION_W: 320, MOTION_H: 180,
}))
vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxSkullHit: vi.fn(), sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(),
  sfxCombo: vi.fn(), sfxWispLink: vi.fn(), sfxShield: vi.fn(),
}))

import { computeFrameDiff } from '../webcam/diff'
import { sfxShield, sfxWispLink } from '../audio/sfx'
const mockDiff = computeFrameDiff as ReturnType<typeof vi.fn>
const DW = 640, DH = 480
const FAKE = {} as ImageData

function enemy(type: Enemy['type'], id: string, over: Partial<Enemy> = {}): Enemy {
  return makeEnemy({
    id, type, x: 320, y: 240, targetX: 320, targetY: 240, speed: 1,
    hitbox: { x: 280, y: 200, w: 80, h: 80 }, spawnedAt: 0, hitCount: 1, ...over,
  })
}
const state = (enemies: Enemy[]) => ({ ...createInitialState(), phase: 'playing' as const, enemies })
const hit = (s: ReturnType<typeof state>) => resolveHits(s, FAKE, FAKE, DW, DH, 1000)

beforeEach(() => { mockDiff.mockReset(); mockDiff.mockReturnValue(true); vi.mocked(sfxShield).mockClear(); vi.mocked(sfxWispLink).mockClear() })

describe('blink ghost', () => {
  it('is banished while solid (120 points)', () => {
    const r = hit(state([enemy('blink', 'b', { vState: 'solid' })]))
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBe(120)
  })
  it('ignores motion while ethereal and resets the gate', () => {
    const r = hit(state([enemy('blink', 'b', { vState: 'ethereal' })]))
    expect(r.enemies).toHaveLength(1)
    expect(r.enemies[0].hitCount).toBe(0)
    expect(r.score).toBe(0)
  })
  it('motion during the spawn grace does nothing', () => {
    const r = resolveHits(state([enemy('blink', 'b', { spawnedAt: 900, vState: 'solid' })]), FAKE, FAKE, DW, DH, 1000)
    expect(r.enemies).toHaveLength(1)
  })
})

describe('mirror ghost', () => {
  it('absorbs a swat on the shield: no score, enemy kept, feedback', () => {
    const r = hit(state([enemy('mirror', 'm', { vState: 'shield' })]))
    expect(r.enemies).toHaveLength(1)
    expect(r.enemies[0].vHits).toBe(1)
    expect(r.enemies[0].absorbMs).toBeGreaterThan(0)
    expect(r.score).toBe(0)
    expect(r.combo).toBe(1)
    expect(r.particles.length).toBeGreaterThan(0)
    expect(sfxShield).toHaveBeenCalled()
  })
  it('the second absorbed swat cracks the shield and keeps combo and lives', () => {
    const base = { ...state([enemy('mirror', 'm', { vState: 'shield', vHits: 1 })]), streak: 4, combo: 2, lives: 2 }
    const r = hit(base)
    expect(r.enemies[0].vState).toBe('cracking')
    expect(r.combo).toBe(2)
    expect(r.lives).toBe(2)
  })
  it('is banished while open (150 points) and closing', () => {
    for (const vs of ['open', 'closing'] as const) {
      const r = hit(state([enemy('mirror', 'm', { vState: vs })]))
      expect(r.enemies).toHaveLength(0)
      expect(r.score).toBe(150)
    }
  })
  it('a swat that has not confirmed yet is not absorbed', () => {
    const r = hit(state([enemy('mirror', 'm', { vState: 'shield', hitCount: 0 })]))
    expect(r.enemies[0].vHits).toBe(0)
  })
})

describe('twin wisps', () => {
  const pair = (a: Partial<Enemy> = {}, b: Partial<Enemy> = {}) => [
    enemy('wisp', 'w1', { pairId: 'p', hitbox: { x: 280, y: 200, w: 80, h: 80 }, ...a }),
    enemy('wisp', 'w2', { pairId: 'p', hitbox: { x: 100, y: 200, w: 80, h: 80 }, hitCount: 0, ...b }),
  ]
  it('the first confirmed hit lights the wisp and scores nothing', () => {
    const r = hit(state(pair()))
    expect(r.enemies).toHaveLength(2)
    expect(r.enemies.find((e) => e.id === 'w1')!.vState).toBe('lit')
    expect(r.score).toBe(0)
    expect(sfxWispLink).toHaveBeenCalled()
  })
  it('hitting the partner while the first is lit banishes both', () => {
    const r = hit(state(pair({ hitCount: 0, vState: 'lit' }, { hitCount: 1 })))
    expect(r.enemies).toHaveLength(0)
    expect(r.score).toBe(300) // 150 x combo 1 for each wisp (the streak is only 1 after the first)
    expect(lastBanished).toHaveLength(2)
  })
  it('both wisps score at the combo the pair was hit at, even across a combo tier (R2.3)', () => {
    const r = hit({ ...state(pair({ hitCount: 0, vState: 'lit' }, { hitCount: 1 })), streak: 2, combo: 1 })
    expect(r.score).toBe(300) // 2 x 150 x 1, not 150 x 1 + 150 x 2
    expect(r.combo).toBe(2)
  })
  it('works when the lit partner comes later in the list', () => {
    const r = hit(state(pair({ hitCount: 1 }, { hitCount: 0, vState: 'merging' })))
    expect(r.enemies).toHaveLength(0)
  })
  it('both hit in the same frame also banish the pair', () => {
    const r = hit(state(pair({ hitCount: 1 }, { hitCount: 1 })))
    expect(r.enemies).toHaveLength(0)
  })
  it('wisps without a pairId never pair with each other', () => {
    const r = hit(state(pair({ pairId: undefined, hitCount: 0, vState: 'lit' }, { pairId: undefined, hitCount: 1 })))
    expect(r.enemies).toHaveLength(2)
    expect(r.score).toBe(0)
  })
  it('after the window the wisp is idle again and a hit only re-links', () => {
    let lit = enemy('wisp', 'w1', { pairId: 'p', vState: 'lit' })
    lit = stepVariant(lit, 2100)
    expect(lit.vState).toBe('idle')
    const r = hit(state([enemy('wisp', 'w1', { pairId: 'p', vState: 'idle' }), enemy('wisp', 'w2', { pairId: 'p', vState: 'idle', hitCount: 0 })]))
    expect(r.enemies).toHaveLength(2)
  })
})

describe('one life per pair', () => {
  const W = 640, H = 360
  const at = (id: string, pairId: string | undefined, x: number): Enemy =>
    enemy('wisp', id, { pairId, x, y: 180, targetX: 320, targetY: 180 })
  it('removes the partner and counts a single miss', () => {
    const r = splitReached([at('a', 'p', 320), at('b', 'p', 100), at('c', 'q', 100)], false, W, H)
    expect(r.missed).toBe(1)
    expect(r.survivors.map((e) => e.id)).toEqual(['c'])
  })
  it('two wisps of one pair arriving together still cost one life', () => {
    expect(splitReached([at('a', 'p', 320), at('b', 'p', 330)], false, W, H).missed).toBe(1)
  })
  it('a mirror ghost and a blink ghost cost a life each like a ghost', () => {
    const m = enemy('mirror', 'm', { x: 320, y: 180, targetX: 320, targetY: 180 })
    const b = enemy('blink', 'b', { x: 320, y: 180, targetX: 320, targetY: 180 })
    expect(splitReached([m, b], false, W, H).missed).toBe(2)
  })
})
