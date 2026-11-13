import { describe, it } from 'vitest'
import fc from 'fast-check'
import { selectCallout, PRAISE_EVERY } from './callouts'
import { comboForStreak } from './state'

describe('selectCallout vs comboForStreak (property)', () => {
  it('tier-up exactly when the combo rises; praise only on even streaks at x2+', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 60 }), (streak) => {
      const prev = comboForStreak(streak - 1)
      const next = comboForStreak(streak)
      const c = selectCallout(prev, next, streak)
      const rose = next > prev
      if (rose) return c?.kind === 'tierUp' && c.text === `x${next} COMBO!`
      if (next >= 2 && streak % PRAISE_EVERY === 0) return c?.kind === 'praise'
      return c === null
    }))
  })
})
