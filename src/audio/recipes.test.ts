import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  SFX_IDS, SFX_GAIN, MUSIC_GAIN, renderRecipe, rawLevel, gainFor, measure, toDb,
  estimateMusicLevel, musicGainFor, recipeFor, recipeSeconds, comboFreq,
  TARGET_RMS_DB, PEAK_CEIL_DB, MUSIC_BELOW_SFX_DB, COMBO_TIERS, type SfxId,
} from './recipes'

const SR = 22050

describe('SFX gain table (R6.1)', () => {
  it('has a positive finite entry for every SFX id and nothing else', () => {
    expect(Object.keys(SFX_GAIN).sort()).toEqual([...SFX_IDS].sort())
    for (const id of SFX_IDS) expect(SFX_GAIN[id]).toBeGreaterThan(0)
    expect(MUSIC_GAIN).toBeGreaterThan(0)
  })

  it('every SFX id has voices, and a combo pitch that rises with the multiplier', () => {
    for (const id of SFX_IDS) expect(recipeFor(id, 2).length).toBeGreaterThan(0)
    expect(comboFreq(2)).toBeLessThan(comboFreq(3))
    expect(comboFreq(3)).toBeLessThan(comboFreq(4))
    expect(comboFreq(99)).toBe(1760)
  })

  it('renders are deterministic and finite', () => {
    for (const id of SFX_IDS) {
      const a = renderRecipe(id, SR), b = renderRecipe(id, SR)
      expect(a).toEqual(b)
      expect(a.every(Number.isFinite)).toBe(true)
      expect(a.length).toBeGreaterThanOrEqual(Math.floor(recipeSeconds(recipeFor(id)) * SR))
    }
  })
})

describe('normalisation (R6.2)', () => {
  it.each(SFX_IDS)('%s: table gain matches the rule, peak <= -3 dBFS, RMS at target unless peak-limited', (id) => {
    const raw = rawLevel(id, SR)
    const rule = gainFor(raw)
    expect(Math.abs(toDb(SFX_GAIN[id] / rule))).toBeLessThan(0.5)
    const peakDb = toDb(raw.peak * SFX_GAIN[id])
    const rmsDb = toDb(raw.rms * SFX_GAIN[id])
    expect(peakDb).toBeLessThanOrEqual(PEAK_CEIL_DB + 0.01)
    const peakLimited = peakDb > PEAK_CEIL_DB - 0.5
    if (!peakLimited) expect(Math.abs(rmsDb - TARGET_RMS_DB)).toBeLessThanOrEqual(1.5)
    else expect(rmsDb).toBeLessThanOrEqual(TARGET_RMS_DB + 1.5)
  })

  it('prints the measured levels', () => {
    const rows = SFX_IDS.map((id) => {
      const l = rawLevel(id, SR)
      return `${id.padEnd(13)} raw peak ${toDb(l.peak).toFixed(1).padStart(6)} rms ${toDb(l.rms).toFixed(1).padStart(6)} | gain ${String(SFX_GAIN[id]).padStart(4)} -> peak ${toDb(l.peak * SFX_GAIN[id]).toFixed(1).padStart(6)} rms ${toDb(l.rms * SFX_GAIN[id]).toFixed(1).padStart(6)} dBFS`
    })
    console.log('\n' + rows.join('\n'))
    expect(rows.length).toBe(SFX_IDS.length)
  })
})

describe('music level (analytic estimate)', () => {
  const m = estimateMusicLevel()
  it('MUSIC_GAIN matches the rule and puts the RMS about 6 dB under the SFX target', () => {
    expect(Math.abs(toDb(MUSIC_GAIN / musicGainFor(m)))).toBeLessThan(0.5)
    const rmsDb = toDb(m.rms * MUSIC_GAIN)
    expect(Math.abs(rmsDb - (TARGET_RMS_DB - MUSIC_BELOW_SFX_DB))).toBeLessThan(1)
  })
  it('worst-case music peak (sum of voice peaks) stays under -6 dBFS', () => {
    expect(toDb(m.peak * MUSIC_GAIN)).toBeLessThan(-6)
  })
})

describe('stacked worst case under 0 dBFS before the limiter (R6.2)', () => {
  const music = estimateMusicLevel().peak * MUSIC_GAIN
  function mixPeak(items: Array<{ id: SfxId; arg?: number; offsetMs: number }>): number {
    const bufs = items.map((it) => ({ b: renderRecipe(it.id, SR, SFX_GAIN[it.id], it.arg ?? 2), at: Math.round((it.offsetMs / 1000) * SR) }))
    const len = Math.max(...bufs.map((x) => x.at + x.b.length))
    const mix = new Float32Array(len)
    for (const { b, at } of bufs) for (let i = 0; i < b.length; i++) mix[at + i] += b[i]
    return measure(mix).peak
  }

  it('boss hit + combo chime + ghost hit at every offset 0-100 ms, plus the music peak', () => {
    let worst = 0
    for (let off = 0; off <= 100; off += 5) {
      worst = Math.max(
        worst,
        mixPeak([{ id: 'bossHit', offsetMs: 0 }, { id: 'combo', arg: 4, offsetMs: off }, { id: 'ghostHit', offsetMs: 100 - off }]),
        mixPeak([{ id: 'bossHit', offsetMs: off }, { id: 'combo', arg: 4, offsetMs: 0 }, { id: 'ghostHit', offsetMs: 0 }]),
      )
    }
    console.log(`stacked boss hit + combo + ghost: sample peak ${toDb(worst).toFixed(1)} dBFS, + music worst-case peak ${toDb(worst + music).toFixed(1)} dBFS`)
    expect(worst + music).toBeLessThan(1)
  })

  it('any three different SFX at any offset stay under 0 dBFS with the music peak', () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.constantFrom(...SFX_IDS), { minLength: 2, maxLength: 3 }),
      fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 3, maxLength: 3 }),
      fc.constantFrom(...COMBO_TIERS),
      (ids, offs, tier) => mixPeak(ids.map((id, i) => ({ id, arg: tier, offsetMs: offs[i] }))) + music < 1,
    ), { numRuns: 120 })
  })
})
