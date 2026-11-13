import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  comboForStreak, COMBO_TIERS, createInitialState, incrementCombo, resetCombo,
} from './state'
import type { GameState } from './state'

// ─── Combo tiers (pbt R6) ─────────────────────────────────────────────────────

describe('combo tiers (properties)', () => {
  it('multiplier is always in {1,2,3,4}', () => {
    fc.assert(fc.property(fc.nat({ max: 1_000_000 }), (n) => {
      expect([1, 2, 3, 4]).toContain(comboForStreak(n))
    }))
  })

  it('multiplier is non-decreasing with streak', () => {
    fc.assert(fc.property(fc.nat({ max: 1_000_000 }), fc.nat({ max: 1_000_000 }), (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      expect(comboForStreak(lo)).toBeLessThanOrEqual(comboForStreak(hi))
    }))
  })

  it('matches the stages R4.1 boundaries (3 → x2, 6 → x3, 10 → x4) for every streak', () => {
    fc.assert(fc.property(fc.nat({ max: 100_000 }), (n) => {
      const expected = n >= 10 ? 4 : n >= 6 ? 3 : n >= 3 ? 2 : 1
      expect(comboForStreak(n)).toBe(expected)
    }))
    expect(COMBO_TIERS.map((t) => t.streak)).toEqual([10, 6, 3])
  })

  type ComboEvent = 'hit' | 'reset'
  const comboEvents = fc.array(
    fc.oneof({ weight: 4, arbitrary: fc.constant<ComboEvent>('hit' as const) },
             { weight: 1, arbitrary: fc.constant<ComboEvent>('reset' as const) }),
    { maxLength: 200 },
  )

  it('reducers keep combo === comboForStreak(streak), bestCombo ≤ 4 and non-decreasing', () => {
    fc.assert(fc.property(comboEvents, (events) => {
      let s: GameState = createInitialState(1)
      let best = s.bestCombo
      for (const ev of events) {
        s = ev === 'hit' ? incrementCombo(s) : resetCombo(s)
        expect(s.combo).toBe(comboForStreak(s.streak))
        expect(s.combo).toBeGreaterThanOrEqual(1)
        expect(s.combo).toBeLessThanOrEqual(4)
        expect(s.bestCombo).toBeLessThanOrEqual(4)
        expect(s.bestCombo).toBeGreaterThanOrEqual(best)
        expect(s.bestCombo).toBeGreaterThanOrEqual(s.combo)
        best = s.bestCombo
      }
    }))
  })
})
