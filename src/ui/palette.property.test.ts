import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { DEFAULT, OKABE_ITO, type Palette } from './palette'
import { DEFICIENCIES, deltaE2000, deltaE76, hexDeltaE, minHexDeltaE, parseHex, rgbToLab, simulateCvd, toHex } from './cvd'

/** Minimum CIEDE2000 distance (R8.4): enemies, players, hud, rings; danger against the background. */
const MIN_PAIR_DE = 12
const MIN_DANGER_DE = 20

const ENEMY: Array<keyof Palette> = ['ghost', 'bat', 'skull', 'lunger', 'pumpkin', 'wisp', 'mirror', 'blink']
const HUD: Array<keyof Palette> = ['life', 'score', 'combo']
const RING: Array<keyof Palette> = ['ringIdle', 'ringFill', 'ringDanger']

function pairs(keys: Array<keyof Palette>): Array<[keyof Palette, keyof Palette]> {
  return keys.flatMap((a, i) => keys.slice(i + 1).map((b) => [a, b] as [keyof Palette, keyof Palette]))
}

const hex = (p: Palette, k: keyof Palette): string => p[k] as string

describe('Okabe-Ito palette keeps its pairs apart under every deficiency (R8.4)', () => {
  const groups: Array<[string, Array<[keyof Palette, keyof Palette]>]> = [
    ['enemy types', pairs(ENEMY)],
    ['P1 / P2', [['p1', 'p2']]],
    ['life / score / combo', pairs(HUD)],
    ['button rings', pairs(RING)],
  ]
  for (const [name, ps] of groups) {
    for (const d of DEFICIENCIES) {
      it(`${name} under ${d}: CIEDE2000 >= ${MIN_PAIR_DE}`, () => {
        for (const [a, b] of ps) expect(hexDeltaE(hex(OKABE_ITO, a), hex(OKABE_ITO, b), d), `${a}/${b}`).toBeGreaterThanOrEqual(MIN_PAIR_DE)
      })
    }
  }

  it('skull and danger cues stand out from the background (>= 20) under every deficiency', () => {
    for (const d of DEFICIENCIES) {
      for (const k of ['skull', 'danger'] as const) {
        expect(hexDeltaE(hex(OKABE_ITO, k), OKABE_ITO.background, d), `${k} ${d}`).toBeGreaterThanOrEqual(MIN_DANGER_DE)
      }
    }
  })

  it('the new ghost colours are never the skull orange / danger red and stand out from the background', () => {
    for (const k of ['wisp', 'mirror', 'blink'] as const) {
      for (const d of DEFICIENCIES) expect(hexDeltaE(hex(OKABE_ITO, k), OKABE_ITO.background, d), `${k} ${d}`).toBeGreaterThanOrEqual(40)
      expect(minHexDeltaE(hex(DEFAULT, k), DEFAULT.skull)).toBeGreaterThanOrEqual(MIN_PAIR_DE)
      expect(minHexDeltaE(hex(DEFAULT, k), DEFAULT.danger)).toBeGreaterThanOrEqual(MIN_PAIR_DE)
    }
  })

  it('candy colours differ from the skull', () => {
    for (const c of OKABE_ITO.candy) expect(minHexDeltaE(c, OKABE_ITO.skull)).toBeGreaterThanOrEqual(MIN_PAIR_DE)
  })

  it('every colour is a valid #rrggbb', () => {
    for (const v of Object.values(OKABE_ITO).flat()) expect(() => parseHex(v)).not.toThrow()
  })
})

describe('why the alternative exists: the default palette is not CVD-safe', () => {
  it('skull and pumpkin are the same orange, and score vs combo collapse for some viewers', () => {
    expect(minHexDeltaE(DEFAULT.skull, DEFAULT.pumpkin)).toBeLessThan(MIN_PAIR_DE)
    expect(minHexDeltaE(DEFAULT.score, DEFAULT.combo)).toBeLessThan(MIN_PAIR_DE)
  })
})

describe('colour maths properties', () => {
  const rgb = fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  it('deltaE2000 is symmetric, non-negative and zero on equal colours', () => {
    fc.assert(fc.property(rgb, rgb, (a, b) => {
      const la = rgbToLab(a), lb = rgbToLab(b)
      expect(deltaE2000(la, la)).toBeCloseTo(0, 9)
      expect(deltaE2000(la, lb)).toBeGreaterThanOrEqual(0)
      expect(deltaE2000(la, lb)).toBeCloseTo(deltaE2000(lb, la), 6)
    }), { numRuns: 500 })
  })
  it('CIE76 and CIEDE2000 agree on order of magnitude for achromatic pairs', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), (x, y) => {
      const la = rgbToLab([x, x, x]), lb = rgbToLab([y, y, y])
      expect(deltaE2000(la, lb)).toBeLessThanOrEqual(deltaE76(la, lb) + 1e-6)
    }), { numRuns: 200 })
  })
  it('simulation stays in range and hex round-trips', () => {
    fc.assert(fc.property(rgb, fc.constantFrom(...DEFICIENCIES), (c, d) => {
      const s = simulateCvd(c, d)
      for (const ch of s) { expect(ch).toBeGreaterThanOrEqual(0); expect(ch).toBeLessThanOrEqual(255) }
      expect(parseHex(toHex(c))).toEqual(c)
    }), { numRuns: 300 })
  })
  it('a colour is never closer to a different one than to itself under simulation', () => {
    fc.assert(fc.property(rgb, rgb, fc.constantFrom(...DEFICIENCIES), (a, b, d) => {
      const sa = rgbToLab(simulateCvd(a, d)), sb = rgbToLab(simulateCvd(b, d))
      expect(deltaE2000(sa, sa)).toBeLessThanOrEqual(deltaE2000(sa, sb) + 1e-9)
    }), { numRuns: 200 })
  })
})
