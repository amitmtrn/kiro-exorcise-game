import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { tierForCombo, effectiveTier, layersForTier, LAYERS, type Layer } from './layers'
import { getTrack } from './patterns'

const on = (tier: number): Layer[] => LAYERS.filter(l => layersForTier(tier)[l])

describe('layersForTier (R3.1)', () => {
  it('x1: bass + hat', () => expect(on(1).sort()).toEqual(['bass', 'hat']))
  it('x2: + kick + snare', () => expect(on(2).sort()).toEqual(['bass', 'hat', 'kick', 'snare']))
  it('x3: + lead', () => expect(on(3).sort()).toEqual(['bass', 'hat', 'kick', 'lead', 'snare']))
  it('x4: everything incl. arpeggio', () => expect(on(4).sort()).toEqual([...LAYERS].sort()))
})

describe('tierForCombo (R3.2)', () => {
  it('clamps and handles junk', () => {
    expect(tierForCombo(0)).toBe(1)
    expect(tierForCombo(-3)).toBe(1)
    expect(tierForCombo(7)).toBe(4)
    expect(tierForCombo(2.9)).toBe(2)
    expect(tierForCombo(NaN)).toBe(1)
    expect(tierForCombo(Infinity)).toBe(1)
    expect(tierForCombo(-Infinity)).toBe(1)
  })
})

describe('effectiveTier (R3.4)', () => {
  it('title is fixed at 3 for any combo', () => {
    for (const c of [1, 2, 3, 4, 99, NaN]) expect(effectiveTier(getTrack('title'), c)).toBe(3)
  })
  it('boss never drops below 2 but can reach 4', () => {
    expect(effectiveTier(getTrack('boss'), 1)).toBe(2)
    expect(effectiveTier(getTrack('boss'), 3)).toBe(3)
    expect(effectiveTier(getTrack('boss'), 4)).toBe(4)
  })
  it('stages follow the combo', () => {
    for (let c = 1; c <= 4; c++) expect(effectiveTier(getTrack('stage2'), c)).toBe(c)
  })
})

describe('properties', () => {
  it('active layer set only grows with combo; bass and hat are always on', () => {
    fc.assert(fc.property(fc.double({ noNaN: false }), fc.double({ noNaN: false }), (a, b) => {
      const [lo, hi] = tierForCombo(a) <= tierForCombo(b) ? [a, b] : [b, a]
      const l = layersForTier(tierForCombo(lo)), h = layersForTier(tierForCombo(hi))
      for (const k of LAYERS) if (l[k] && !h[k]) return false
      return h.bass && h.hat && l.bass && l.hat
    }))
  })
})
