import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { resolveHits } from './collision'
import {
  createInitialState, makeEnemy, decrementLife, addScore, incrementCombo, resetCombo,
  incrementBanished, incrementMissed, tickTimer, setFlash,
} from './state'
import type { Enemy, EnemyType, GameState } from './state'
import { advanceToNextStage } from './round'
import { hitboxFor } from './enemies/movement'
import { MOTION_W, MOTION_H } from '../webcam/diff'

// Audio needs an AudioContext; production wraps every call in try/catch.
vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxSkullHit: vi.fn(),
  sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(), sfxCombo: vi.fn(),
}))

const DW = 640, DH = 360
const TYPES: EnemyType[] = ['ghost', 'bat', 'skull', 'lunger', 'pumpkin', 'boss']

// ─── Synthetic frames: previous = black, current = bright blocks ──────────────

type Rect = { x: number; y: number; w: number; h: number }

function frame(rects: Rect[]): { cur: ImageData; prev: ImageData } {
  const n = MOTION_W * MOTION_H * 4
  const cur = new Uint8ClampedArray(n)
  const prev = new Uint8ClampedArray(n)
  for (const r of rects) {
    for (let y = r.y; y < Math.min(MOTION_H, r.y + r.h); y++) {
      for (let x = r.x; x < Math.min(MOTION_W, r.x + r.w); x++) {
        const i = (y * MOTION_W + x) * 4
        cur[i] = cur[i + 1] = cur[i + 2] = 255
      }
    }
  }
  return {
    cur: { data: cur, width: MOTION_W, height: MOTION_H } as ImageData,
    prev: { data: prev, width: MOTION_W, height: MOTION_H } as ImageData,
  }
}

const rectArb: fc.Arbitrary<Rect> = fc.record({
  x: fc.integer({ min: 0, max: MOTION_W - 1 }),
  y: fc.integer({ min: 0, max: MOTION_H - 1 }),
  w: fc.integer({ min: 1, max: MOTION_W }),
  h: fc.integer({ min: 1, max: MOTION_H }),
})

const enemyArb: fc.Arbitrary<Enemy> = fc.record({
  type: fc.constantFrom(...TYPES),
  x: fc.integer({ min: 0, max: DW }),
  y: fc.integer({ min: 0, max: DH }),
  hitsNeeded: fc.integer({ min: 1, max: 3 }),
  hitsReceived: fc.integer({ min: 0, max: 2 }),
  bossHitsReceived: fc.integer({ min: 0, max: 2 }),
  exiting: fc.boolean(),
}).map((r) => makeEnemy({
  id: `e${r.x}-${r.y}-${r.type}`,
  type: r.type, x: r.x, y: r.y, targetX: DW / 2, targetY: DH / 2, speed: 0.1,
  hitbox: hitboxFor(r.type, r.x, r.y),
  hitCount: 1, // one more new frame with motion confirms the hit
  hitsNeeded: r.type === 'boss' ? 3 : r.hitsNeeded,
  hitsReceived: Math.min(r.hitsReceived, r.hitsNeeded - 1),
  bossHitsReceived: Math.min(r.bossHitsReceived, 2),
  exiting: r.type === 'skull' && r.exiting,
}))

// ─── Event model ──────────────────────────────────────────────────────────────

type Ev =
  | { k: 'skullHit' }
  | { k: 'reachCenter' }
  | { k: 'banish'; points: number }
  | { k: 'tick'; ms: number }
  | { k: 'resolve'; enemies: Enemy[]; rects: Rect[]; isNew: boolean }
  | { k: 'advance' }

const eventArb: fc.Arbitrary<Ev> = fc.oneof(
  fc.constant<Ev>({ k: 'skullHit' }),
  fc.constant<Ev>({ k: 'reachCenter' }),
  fc.record({ k: fc.constant('banish' as const), points: fc.integer({ min: 0, max: 2000 }) }),
  fc.record({ k: fc.constant('tick' as const), ms: fc.integer({ min: 0, max: 70_000 }) }),
  fc.record({
    k: fc.constant('resolve' as const),
    enemies: fc.array(enemyArb, { maxLength: 6 }),
    rects: fc.array(rectArb, { maxLength: 4 }),
    isNew: fc.boolean(),
  }),
  fc.constant<Ev>({ k: 'advance' }),
)

function apply(s: GameState, ev: Ev): GameState {
  switch (ev.k) {
    case 'skullHit': return setFlash(decrementLife(s), 0)
    case 'reachCenter': return incrementMissed(resetCombo(decrementLife(s)))
    case 'banish': {
      s = addScore(s, ev.points * s.combo)
      return incrementBanished(incrementCombo(s))
    }
    case 'tick': return tickTimer(s, ev.ms)
    case 'advance': return s.phase === 'summary' ? advanceToNextStage(s, DW, DH) : s
    case 'resolve': {
      const { cur, prev } = frame(ev.rects)
      return resolveHits({ ...s, enemies: ev.enemies }, cur, prev, DW, DH, 1000, ev.isNew)
    }
  }
}

describe('lives and score under any event sequence (properties)', () => {
  it('lives is a non-negative integer that never increases; gameover at 0', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 5 }), fc.array(eventArb, { maxLength: 40 }),
      (stage, events) => {
        let s: GameState = { ...createInitialState(stage), phase: 'playing' }
        for (const ev of events) {
          const before = s
          s = apply(s, ev)
          expect(Number.isInteger(s.lives)).toBe(true)
          expect(s.lives).toBeGreaterThanOrEqual(0)
          expect(s.lives).toBeLessThanOrEqual(before.lives)
          if (s.lives === 0 && before.lives > 0) expect(s.phase).toBe('gameover')
        }
      },
    ))
  })

  it('score is monotonic non-decreasing; highScore is monotonic and ≥ score', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 5 }), fc.array(eventArb, { maxLength: 40 }),
      (stage, events) => {
        let s: GameState = { ...createInitialState(stage), phase: 'playing' }
        for (const ev of events) {
          const before = s
          s = apply(s, ev)
          expect(Number.isFinite(s.score)).toBe(true)
          expect(s.score).toBeGreaterThanOrEqual(before.score)
          expect(s.highScore).toBeGreaterThanOrEqual(before.highScore)
          expect(s.highScore).toBeGreaterThanOrEqual(s.score)
        }
      },
    ))
  })

  it('combo stays consistent with streak and within x1–x4 through resolveHits', () => {
    fc.assert(fc.property(fc.array(eventArb, { maxLength: 40 }), (events) => {
      let s: GameState = { ...createInitialState(4), phase: 'playing' }
      for (const ev of events) {
        s = apply(s, ev)
        expect(s.combo).toBeGreaterThanOrEqual(1)
        expect(s.combo).toBeLessThanOrEqual(4)
      }
    }))
  })
})
