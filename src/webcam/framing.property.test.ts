import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { checkFraming, tickFraming, FRAMING_MIN_LUMA } from './framing'

const STATUSES = ['ok', 'too-dark', 'too-close', 'low-detail']
const W = 16, H = 9

const frameArb = fc.uint8Array({ minLength: W * H * 4, maxLength: W * H * 4 })

describe('checkFraming (property)', () => {
  it('is deterministic and always returns a known status', () => {
    fc.assert(fc.property(frameArb, (data) => {
      const f = { data, width: W, height: H }
      const a = checkFraming(f)
      expect(STATUSES).toContain(a)
      expect(checkFraming(f)).toBe(a)
    }))
  })

  it('any frame whose pixels are all below the luma floor is too-dark', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 0, max: FRAMING_MIN_LUMA - 1 }), { minLength: W * H, maxLength: W * H }),
      (vals) => {
        const data = new Uint8ClampedArray(W * H * 4)
        vals.forEach((v, i) => { data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255 })
        expect(checkFraming({ data, width: W, height: H })).toBe('too-dark')
      },
    ))
  })
})

describe('tickFraming (property)', () => {
  it('equals the sum of deltas for an all-ok run and is never negative', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 200 }), { maxLength: 60 }), (deltas) => {
      let ms = 0
      for (const d of deltas) ms = tickFraming(ms, 'ok', d)
      expect(ms).toBe(deltas.reduce((a, b) => a + b, 0))
    }))
  })

  it('any non-ok status resets to zero', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 100000 }), fc.constantFrom('too-dark', 'too-close', 'low-detail' as const), fc.integer({ min: 0, max: 500 }),
      (ms, s, d) => { expect(tickFraming(ms, s as 'too-dark', d)).toBe(0) },
    ))
  })
})
