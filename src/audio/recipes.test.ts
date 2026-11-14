import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  SFX_IDS, SFX_GAIN, MUSIC_GAIN, renderRecipe, rawLevel, gainFor, measure, toDb,
  estimateMusicLevel, musicGainFor, MUSIC_VOICES, recipeFor, recipeSeconds, comboFreq,
  TARGET_RMS_DB, PEAK_CEIL_DB, tableGain, SFX_TRIM_DB, MUSIC_BELOW_SFX_DB, STACK_MARGIN, stackPeakCeil, COMBO_TIERS, type SfxId,
} from './recipes'
import { VOICE_PEAKS } from './music/voices'

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
    const rule = tableGain(id, SR) // gainFor(raw) plus the UI trim (playtest2-fixes)
    expect(Math.abs(toDb(SFX_GAIN[id] / rule))).toBeLessThan(0.5)
    const trim = SFX_TRIM_DB[id] ?? 0
    const peakDb = toDb(raw.peak * SFX_GAIN[id])
    const rmsDb = toDb(raw.rms * SFX_GAIN[id])
    expect(peakDb).toBeLessThanOrEqual(PEAK_CEIL_DB + 0.01)
    const ceilDb = Math.min(PEAK_CEIL_DB, toDb(stackPeakCeil())) // the -3 dBFS ceiling or the three-way stack ceiling
    expect(peakDb).toBeLessThanOrEqual(ceilDb + 1e-9)
    const peakLimited = peakDb > ceilDb - 0.5
    if (!peakLimited && toDb(gainFor(raw) * raw.peak) < ceilDb - 0.5) expect(Math.abs(rmsDb - (TARGET_RMS_DB + trim))).toBeLessThanOrEqual(1.5)
    else expect(rmsDb).toBeLessThanOrEqual(TARGET_RMS_DB + trim + 1.5)
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
  // Renders are deterministic: cache them so the grid only pays for the mixing.
  const cache = new Map<string, Float32Array>()
  const rendered = (id: SfxId, arg: number): Float32Array => {
    const key = `${id}:${id === 'combo' ? arg : 2}`
    let b = cache.get(key)
    if (!b) { b = renderRecipe(id, SR, SFX_GAIN[id], arg); cache.set(key, b) }
    return b
  }
  function mixPeak(items: Array<{ id: SfxId; arg?: number; offsetMs: number }>): number {
    const bufs = items.map((it) => ({ b: rendered(it.id, it.arg ?? 2), at: Math.round((it.offsetMs / 1000) * SR) }))
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

  it('the exact playtest-1 counterexample (lifeLost, shield, ghostHit at 37 / 80 / 83 ms, combo tier 2) is under 0 dBFS', () => {
    // Before the fix: 1.0006 (shield and ghostHit were normalised by RMS only, so their noise peaks were 0.30 and 0.32).
    expect(mixPeak([{ id: 'lifeLost', offsetMs: 37 }, { id: 'shield', offsetMs: 80 }, { id: 'ghostHit', offsetMs: 83 }]) + music).toBeLessThan(1)
  })

  it('stack bound: every SFX peak is within the stack ceiling, so ANY three overlap with the music peak stay under 0 dBFS', () => {
    const ceil = stackPeakCeil()
    for (const id of SFX_IDS) {
      const l = rawLevel(id, SR)
      expect(l.peak * SFX_GAIN[id], id).toBeLessThanOrEqual(ceil + 1e-9)
    }
    const top3 = SFX_IDS.map((id) => rawLevel(id, SR).peak * SFX_GAIN[id]).sort((a, b) => b - a).slice(0, 3)
    expect(top3[0] + top3[1] + top3[2] + music).toBeLessThanOrEqual(1 - STACK_MARGIN + 1e-9)
  })

  it('every pair and triple of different SFX (playtest2-fixes sounds included) on a 25 ms offset grid (0-100) stays under 0 dBFS, all combo tiers', () => {
    const grid = [0, 25, 50, 75, 100]
    let worst = 0
    // The tier only changes the combo chime: other mixes are rendered once (playtest2-fixes added four ids).
    const tiersFor = (...ids: SfxId[]) => (ids.includes('combo') ? COMBO_TIERS : [2])
    for (let a = 0; a < SFX_IDS.length; a++) for (let b = a + 1; b < SFX_IDS.length; b++) {
      for (const tier of tiersFor(SFX_IDS[a], SFX_IDS[b])) {
        for (const ob of grid) worst = Math.max(worst, mixPeak([{ id: SFX_IDS[a], arg: tier, offsetMs: 0 }, { id: SFX_IDS[b], arg: tier, offsetMs: ob }]) + music)
      }
      for (let c = b + 1; c < SFX_IDS.length; c++) for (const tier of tiersFor(SFX_IDS[a], SFX_IDS[b], SFX_IDS[c])) for (const ob of grid) for (const oc of grid) {
          worst = Math.max(worst, mixPeak([{ id: SFX_IDS[a], arg: tier, offsetMs: 0 }, { id: SFX_IDS[b], arg: tier, offsetMs: ob }, { id: SFX_IDS[c], arg: tier, offsetMs: oc }]) + music)
      }
    }
    expect(worst).toBeLessThan(1)
  }, 60_000) // about 10 000 mixes of a few thousand samples: legitimately long on a slow runner

  it('any three different SFX at any offset stay under 0 dBFS with the music peak', () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.constantFrom(...SFX_IDS), { minLength: 2, maxLength: 3 }),
      fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 3, maxLength: 3 }),
      fc.constantFrom(...COMBO_TIERS),
      (ids, offs, tier) => mixPeak(ids.map((id, i) => ({ id, arg: tier, offsetMs: offs[i] }))) + music < 1,
    ), { numRuns: 300 })
  }, 30_000) // about 35 s at 20 000 runs (checked once with the failing seed 1120058258, and again at 20 000 runs with the playtest2-fixes sounds); 300 runs keep CI fast
})

describe('MUSIC_VOICES peaks come from the voices (review fix)', () => {
  it('match VOICE_PEAKS', () => {
    const peak = (n: string) => MUSIC_VOICES.find((v) => v.name === n)!.peak
    expect(peak('bass')).toBe(VOICE_PEAKS.bass)
    expect(peak('kick')).toBe(VOICE_PEAKS.kickAccent)
    expect(peak('snare')).toBeCloseTo(VOICE_PEAKS.snareAccent + VOICE_PEAKS.snareTone, 10)
    expect(peak('hat')).toBe(VOICE_PEAKS.hatAccent)
    expect(peak('lead')).toBeCloseTo(VOICE_PEAKS.lead * VOICE_PEAKS.leadHeadroom, 10)
    expect(peak('arp')).toBe(VOICE_PEAKS.arp)
  })
})
