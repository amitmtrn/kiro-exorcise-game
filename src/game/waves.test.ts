import { describe, it, expect } from 'vitest'
import { STAGES, stageLabel } from './stages'
import { STAGE_SCRIPTS, BONUS_ROUND, intensityAt, spawnRateFor, speedFactorFor, pickPath } from './waves'
import type { WaveScript, WaveKind } from './waves'
import { WAVE_PATHS } from './paths'
import type { WavePath } from './paths'
import { createInitialState } from './state'

const kindEnabled = (mix: { ghost: boolean; bat: boolean; pumpkin: boolean }, k: WaveKind, bonus = false) =>
  k === 'ghost' ? mix.ghost : k === 'bat' ? mix.bat : k === 'pumpkin' ? mix.pumpkin : bonus

/** [script, enemyMix, durationMs, spawnEdges, label] for every stage with a script plus the bonus round. */
const SCRIPTED = [
  ...STAGES.filter((s) => s.waves).map((s) => ({
    label: s.name, script: s.waves as WaveScript, mix: s.enemyMix, durationMs: s.durationMs,
    edges: s.spawnEdges as string, bonus: false,
  })),
  {
    label: 'bonus', script: BONUS_ROUND.script, mix: BONUS_ROUND.enemyMix, durationMs: BONUS_ROUND.durationMs,
    edges: 'all', bonus: true,
  },
]

describe('wave scripts — validation', () => {
  it('stages 1–4 have scripts; the boss stage keeps its own spawning', () => {
    expect(STAGES.slice(0, 4).every((s) => s.waves !== undefined)).toBe(true)
    expect(STAGES[4].waves).toBeUndefined()
    expect(STAGES[4].enemyMix.boss).toBe(true)
    expect(Object.keys(STAGE_SCRIPTS).map(Number).sort()).toEqual([1, 2, 3, 4])
  })

  it('STAGE_SCRIPTS are the ones referenced from stages.ts', () => {
    for (let i = 0; i < 4; i++) expect(STAGES[i].waves).toBe(STAGE_SCRIPTS[i + 1])
  })

  for (const { label, script, mix, durationMs, edges, bonus } of SCRIPTED) {
    describe(label, () => {
      it('events are ordered, inside the stage, with positive counts and valid paths', () => {
        let last = -1
        for (const ev of script.events) {
          expect(ev.atMs).toBeGreaterThanOrEqual(last)
          expect(ev.atMs).toBeGreaterThanOrEqual(0)
          expect(ev.atMs).toBeLessThan(durationMs)
          expect(Number.isInteger(ev.count) && ev.count >= 1).toBe(true)
          expect(WAVE_PATHS).toContain(ev.path)
          if (ev.height !== undefined) {
            expect(ev.height).toBeGreaterThanOrEqual(0.15)
            expect(ev.height).toBeLessThanOrEqual(0.8)
          }
          last = ev.atMs
        }
      })

      it('only uses enemy kinds that the stage enables (never skull, lunger or boss)', () => {
        for (const ev of script.events) expect(kindEnabled(mix, ev.kind, bonus)).toBe(true)
        for (const kind of Object.keys(script.pathMix) as WaveKind[]) {
          expect(kindEnabled(mix, kind, bonus)).toBe(true)
        }
      })

      it('every enabled random-spawner kind has a path mix with positive weights', () => {
        const need: WaveKind[] = []
        if (mix.ghost) need.push('ghost')
        if (mix.bat) need.push(bonus ? 'candy' : 'bat')
        if (mix.pumpkin) need.push('pumpkin')
        for (const kind of need) {
          const m = script.pathMix[kind]
          expect(m, `${label} ${kind}`).toBeDefined()
          const w = Object.values(m!)
          expect(w.length).toBeGreaterThan(0)
          expect(w.every((x) => (x ?? 0) > 0)).toBe(true)
          expect(Object.keys(m!).every((p) => (WAVE_PATHS as readonly string[]).includes(p))).toBe(true)
        }
      })

      it('a leftRight stage never drops in from the top', () => {
        if (edges !== 'leftRight') return
        const used: WavePath[] = [
          ...script.events.map((e) => e.path),
          ...Object.values(script.pathMix).flatMap((m) => Object.keys(m ?? {}) as WavePath[]),
        ]
        expect(used).not.toContain('drop')
      })

      it('the intensity curve is well formed', () => {
        const { points, peakAt } = script.intensity
        expect(points[0][0]).toBe(0)
        expect(points[points.length - 1][0]).toBe(1)
        for (let i = 1; i < points.length; i++) expect(points[i][0]).toBeGreaterThan(points[i - 1][0])
        expect(points.every(([, v]) => v >= 0 && v <= 1)).toBe(true)
        expect(points.some(([t]) => t === peakAt)).toBe(true)
        expect(peakAt).toBeLessThan(1)
      })
    })
  }

  it('bats are points, not threats: only flyby and swarm', () => {
    for (const { script } of SCRIPTED) {
      for (const p of Object.keys(script.pathMix.bat ?? {})) expect(['flyby', 'swarm']).toContain(p)
      for (const ev of script.events) if (ev.kind === 'bat') expect(['flyby', 'swarm']).toContain(ev.path)
    }
  })
})

describe('intensity curve', () => {
  const sample = (script: WaveScript, n = 400) =>
    Array.from({ length: n + 1 }, (_, i) => ({ t: i / n, v: intensityAt(script.intensity, i / n) }))

  for (const { label, script } of SCRIPTED) {
    it(`${label}: calm start, non-decreasing up to the peak, maximal at the peak`, () => {
      const pts = sample(script)
      expect(pts[0].v).toBeLessThanOrEqual(0.3)
      const peak = intensityAt(script.intensity, script.intensity.peakAt)
      let prev = -Infinity
      for (const { t, v } of pts) {
        expect(v).toBeLessThanOrEqual(peak + 1e-12)
        if (t <= script.intensity.peakAt) {
          expect(v).toBeGreaterThanOrEqual(prev - 1e-12)
          prev = v
        }
      }
      expect(peak).toBeGreaterThan(pts[0].v)
    })
  }

  it('peaks rise from stage to stage and stage 4 (before the boss) peaks at 1.0, late in the stage', () => {
    const peaks = [1, 2, 3, 4].map((i) => intensityAt(STAGE_SCRIPTS[i].intensity, STAGE_SCRIPTS[i].intensity.peakAt))
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeGreaterThan(peaks[i - 1])
    expect(peaks[3]).toBe(1)
    expect(STAGE_SCRIPTS[4].intensity.peakAt).toBeGreaterThanOrEqual(0.75)
  })

  it('clamps progress outside 0–1', () => {
    const c = STAGE_SCRIPTS[2].intensity
    expect(intensityAt(c, -5)).toBe(intensityAt(c, 0))
    expect(intensityAt(c, 7)).toBe(intensityAt(c, 1))
  })

  it('interpolates linearly between points', () => {
    expect(intensityAt({ points: [[0, 0], [1, 1]], peakAt: 1 }, 0.25)).toBeCloseTo(0.25, 12)
  })

  it('spawn rate and speed factor rise with the level', () => {
    expect(spawnRateFor(0)).toBeCloseTo(0.6, 12)
    expect(spawnRateFor(1)).toBeCloseTo(1.5, 12)
    expect(speedFactorFor(0)).toBeCloseTo(0.85, 12)
    expect(speedFactorFor(1)).toBeCloseTo(1.15, 12)
    for (let l = 0; l < 1; l += 0.1) {
      expect(spawnRateFor(l + 0.1)).toBeGreaterThan(spawnRateFor(l))
      expect(speedFactorFor(l + 0.1)).toBeGreaterThan(speedFactorFor(l))
    }
  })
})

describe('bonus round config', () => {
  it('is 15 s, after stage 2, and spawns no ghost / skull / lunger / boss', () => {
    expect(BONUS_ROUND.durationMs).toBe(15_000)
    expect(STAGES[1].bonusAfter).toBe(BONUS_ROUND)
    expect(STAGES.filter((s) => s.bonusAfter).map((s) => s.id)).toEqual([2])
    const { ghost, skull, lunger, boss } = BONUS_ROUND.enemyMix
    expect([ghost, skull, lunger, boss]).toEqual([false, false, false, false])
    const iv = BONUS_ROUND.spawnIntervalMs
    expect(iv.ghost).toBeGreaterThanOrEqual(99999)
    expect(iv.skull).toBeGreaterThanOrEqual(99999)
    expect(iv.lunger).toBeGreaterThanOrEqual(99999)
  })

  it('only scripts exiting path types (nothing can reach a target)', () => {
    const exiting: WavePath[] = ['flyby', 'swarm', 'drop']
    for (const m of Object.values(BONUS_ROUND.script.pathMix)) {
      for (const p of Object.keys(m ?? {})) expect(exiting).toContain(p)
    }
    for (const ev of BONUS_ROUND.script.events) {
      expect(exiting).toContain(ev.path)
      expect(['candy', 'pumpkin']).toContain(ev.kind)
    }
  })

  it('stageLabel names the bonus round and the stage', () => {
    expect(stageLabel({ stage: 2, bonus: true })).toEqual({ name: 'Bonus Round', subtitle: 'Candy Storm' })
    expect(stageLabel({ stage: 2, bonus: false })).toEqual({ name: 'Stage 2', subtitle: 'Haunted Forest' })
    expect(createInitialState(1).bonus).toBe(false)
    expect(createInitialState(1).waveIndex).toBe(0)
  })
})

describe('pickPath', () => {
  it('is weighted and covers the whole mix', () => {
    const mix = { line: 1, flyby: 3 }
    expect(pickPath(mix, 0)).toBe('line')
    expect(pickPath(mix, 0.24)).toBe('line')
    expect(pickPath(mix, 0.26)).toBe('flyby')
    expect(pickPath(mix, 0.999999)).toBe('flyby')
  })
  it('falls back to line for an empty or missing mix', () => {
    expect(pickPath({}, 0.5)).toBe('line')
    expect(pickPath(undefined, 0.5)).toBe('line')
  })
})
