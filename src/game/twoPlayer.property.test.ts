import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'

vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxSkullHit: vi.fn(),
  sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(), sfxCombo: vi.fn(),
}))
vi.mock('../audio/index', () => ({ sfxLifeLost: vi.fn() }))

import { createTwoPlayer, tickTwoPlayer } from './twoPlayer'
import type { TwoPlayerState, MotionInput } from './twoPlayer'
import { addScore, incrementCombo, decrementLife } from './state'
import type { GameState } from './state'
import { MOTION_W, MOTION_H } from '../webcam/diff'

const W = 1280, H = 720

function mask(rects: Array<{ x: number; y: number; w: number; h: number }>): MotionInput {
  const cur = new Uint8ClampedArray(MOTION_W * MOTION_H * 4)
  const prev = new Uint8ClampedArray(MOTION_W * MOTION_H * 4)
  for (const r of rects) {
    for (let y = Math.max(0, r.y); y < Math.min(MOTION_H, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(MOTION_W, r.x + r.w); x++) {
        const i = (y * MOTION_W + x) * 4
        cur[i] = cur[i + 1] = cur[i + 2] = 255
      }
    }
  }
  const mk = (d: Uint8ClampedArray) => ({ data: d, width: MOTION_W, height: MOTION_H }) as unknown as ImageData
  return { cur: mk(cur), prev: mk(prev), frameIsNew: true, now: 100_000 }
}

function playing(): TwoPlayerState {
  let t = createTwoPlayer()
  for (let i = 0; i < 300 && t.phase !== 'playing'; i++) t = tickTwoPlayer(t, 16, W, H, null)
  return t
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.37)
  vi.spyOn(performance, 'now').mockReturnValue(50_000)
})
afterEach(() => { vi.restoreAllMocks() })

describe('two-player — properties', () => {
  it('the shared clock is identical in both seats and independent of how the time is split into ticks', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 40 }),
      (deltas) => {
        let t = playing()
        const start = t.roundTimeMs
        let total = 0
        for (const d of deltas) {
          t = tickTwoPlayer(t, d, W, H, null)
          if (t.phase !== 'playing') break
          total += d
          expect(t.seats[0].roundTimeMs).toBe(t.seats[1].roundTimeMs)
          expect(t.seats[0].roundTimeMs).toBe(t.roundTimeMs)
        }
        if (t.phase === 'playing') expect(t.roundTimeMs).toBeCloseTo(start - total, 6)
      },
    ), { numRuns: 60 })
  })

  it('the clock never increases', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 40 }), (deltas) => {
      let t = playing()
      let last = t.roundTimeMs
      for (const d of deltas) {
        t = tickTwoPlayer(t, d, W, H, null)
        if (t.phase !== 'playing') break
        expect(t.roundTimeMs).toBeLessThanOrEqual(last)
        last = t.roundTimeMs
      }
    }))
  })

  it('right seat\'s next state does not depend on the left seat\'s score, combo, lives or left-half motion', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 5000 }),
      fc.integer({ min: 0, max: 12 }),
      fc.integer({ min: 0, max: 2 }),
      fc.array(fc.record({
        x: fc.integer({ min: 0, max: 159 }), y: fc.integer({ min: 0, max: MOTION_H }),
        w: fc.integer({ min: 1, max: 160 }), h: fc.integer({ min: 1, max: MOTION_H }),
      }), { maxLength: 6 }),
      fc.integer({ min: 1, max: 100 }),
      (score, streak, livesLost, leftRects, delta) => {
        const base = playing()
        const tweak = (s: GameState): GameState => {
          let x = addScore(s, score)
          for (let i = 0; i < streak; i++) x = incrementCombo(x)
          for (let i = 0; i < livesLost; i++) x = decrementLife(x)
          return x
        }
        const altered: TwoPlayerState = { ...base, seats: [tweak(base.seats[0]), base.seats[1]] }
        const a = tickTwoPlayer(base, delta, W, H, mask([]))
        const b = tickTwoPlayer(altered, delta, W, H, mask(leftRects)) // motion only in columns 0-159
        expect(b.seats[1]).toEqual(a.seats[1])
        expect(b.banished[1]).toEqual(a.banished[1])
      },
    ), { numRuns: 60 })
  })

  it('left seat likewise ignores anything that happens in the right half', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 5000 }),
      fc.array(fc.record({
        x: fc.integer({ min: 160, max: 319 }), y: fc.integer({ min: 0, max: MOTION_H }),
        w: fc.integer({ min: 1, max: 160 }), h: fc.integer({ min: 1, max: MOTION_H }),
      }), { maxLength: 6 }),
      (score, rightRects) => {
        const base = playing()
        const altered: TwoPlayerState = { ...base, seats: [base.seats[0], addScore(base.seats[1], score)] }
        const a = tickTwoPlayer(base, 16, W, H, mask([]))
        const b = tickTwoPlayer(altered, 16, W, H, mask(rightRects))
        expect(b.seats[0]).toEqual(a.seats[0])
      },
    ), { numRuns: 60 })
  })
})
