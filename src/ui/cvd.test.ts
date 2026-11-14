import { describe, it, expect } from 'vitest'
import {
  parseHex, toHex, srgbToLinear, linearToSrgb, rgbToLab, deltaE76, deltaE2000, simulateCvd, hexDeltaE, minHexDeltaE,
  CVD_MATRICES, DEFICIENCIES, type Lab,
} from './cvd'

describe('hex and sRGB', () => {
  it('parses #rrggbb and #rgb, rejects junk', () => {
    expect(parseHex('#ff6b1a')).toEqual([255, 107, 26])
    expect(parseHex('#0f8')).toEqual([0, 255, 136])
    expect(() => parseHex('orange')).toThrow()
    expect(() => parseHex('#12345')).toThrow()
    expect(toHex([255, 107, 26])).toBe('#ff6b1a')
  })
  it('sRGB transfer function round-trips', () => {
    for (let c = 0; c <= 255; c += 5) expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 6)
  })
})

describe('Lab', () => {
  it('white is L 100, black is L 0, grey has no chroma', () => {
    const w = rgbToLab([255, 255, 255]), k = rgbToLab([0, 0, 0]), g = rgbToLab([128, 128, 128])
    expect(w[0]).toBeCloseTo(100, 1)
    expect(Math.abs(w[1])).toBeLessThan(0.05)
    expect(Math.abs(w[2])).toBeLessThan(0.05)
    expect(k[0]).toBeCloseTo(0, 6)
    expect(Math.hypot(g[1], g[2])).toBeLessThan(0.05)
  })
  it('sRGB red is the textbook Lab (53.2, 80.1, 67.2)', () => {
    const [L, a, b] = rgbToLab([255, 0, 0])
    expect(L).toBeCloseTo(53.24, 1)
    expect(a).toBeCloseTo(80.09, 1)
    expect(b).toBeCloseTo(67.2, 1)
  })
})

describe('colour difference', () => {
  it('CIE76 is the Euclidean distance', () => {
    expect(deltaE76([50, 0, 0], [53, 4, 0])).toBe(5)
  })
  // Sharma, Wu, Dalal (2005) test data
  const cases: Array<[Lab, Lab, number]> = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ]
  it.each(cases)('CIEDE2000 matches the reference pair %j %j', (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 3)
    expect(deltaE2000(b, a)).toBeCloseTo(expected, 3)
  })
})

describe('CVD simulation (Machado 2009, severity 1)', () => {
  it('rows of every matrix sum to 1, so greys stay grey', () => {
    for (const m of Object.values(CVD_MATRICES)) for (const row of m) expect(row[0] + row[1] + row[2]).toBeCloseTo(1, 4)
    for (const d of DEFICIENCIES) for (const v of [0, 64, 128, 255]) {
      const out = simulateCvd([v, v, v], d)
      for (const c of out) expect(c).toBeCloseTo(v, 0)
    }
  })
  it('none is the identity; output stays in 0..255', () => {
    expect(simulateCvd([12, 200, 99], 'none')).toEqual([12, 200, 99])
    for (const d of DEFICIENCIES) for (const c of simulateCvd([255, 0, 128], d)) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(255) }
  })
  it('red and green converge for protan and deutan viewers, blue and green for tritan', () => {
    const red = '#ff0000', green = '#00b000', blue = '#0000ff', teal = '#00a0a0'
    expect(hexDeltaE(red, green, 'protanopia')).toBeLessThan(hexDeltaE(red, green, 'none') / 2)
    expect(hexDeltaE(red, green, 'deuteranopia')).toBeLessThan(hexDeltaE(red, green, 'none') / 2)
    expect(hexDeltaE(blue, teal, 'tritanopia')).toBeLessThan(hexDeltaE(blue, teal, 'none') / 1.5)
  })
  it('minHexDeltaE is the minimum over the four viewers', () => {
    const m = minHexDeltaE('#ff6b1a', '#39ff14')
    expect(m).toBe(Math.min(...DEFICIENCIES.map((d) => hexDeltaE('#ff6b1a', '#39ff14', d))))
  })
})
