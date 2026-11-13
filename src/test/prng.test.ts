import { describe, it, expect } from 'vitest'
import { mulberry32, withSeededRandom } from './prng'

describe('seeded random helper', () => {
  it('same seed gives the same sequence, values in [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42)
    for (let i = 0; i < 100; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('different seeds give different sequences', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('replaces Math.random inside fn and restores it afterwards', () => {
    const original = Math.random
    const inside = withSeededRandom(7, () => [Math.random(), Math.random()])
    expect(Math.random).toBe(original)
    expect(withSeededRandom(7, () => [Math.random(), Math.random()])).toEqual(inside)
  })

  it('restores Math.random even when fn throws', () => {
    const original = Math.random
    expect(() => withSeededRandom(1, () => { throw new Error('x') })).toThrow('x')
    expect(Math.random).toBe(original)
  })
})
