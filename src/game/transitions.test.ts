import { describe, it, expect } from 'vitest'
import { easeOutBack } from './transitions'

describe('easeOutBack', () => {
  it('maps 0 → 0 and 1 → 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 12)
    expect(easeOutBack(1)).toBeCloseTo(1, 12)
  })
  it('overshoots 1 on the way in and clamps outside [0, 1]', () => {
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(easeOutBack))).toBeGreaterThan(1)
    expect(easeOutBack(-3)).toBeCloseTo(0, 12)
    expect(easeOutBack(7)).toBeCloseTo(1, 12)
  })
})
