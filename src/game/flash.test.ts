import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  createFlashScheduler, requestFlash, flashAlphaAt, advance, simulateWaveform, countFlashes, maxFlashesPerWindow,
  overlayAlpha, shakeScale, MAX_FLASHES_PER_S, NORMAL_ALPHA, REDUCED_ALPHA, RAMP_MS, REDUCED_SHAKE,
} from './flash'
import { renderFrame } from './render'
import { TIMER_BLINK_MS } from '../ui/hud'
import { createInitialState, makeEnemy } from './state'
import type { GameState } from './state'
import { initSettings, resetSettings } from '../settings/runtime'
import { DEFAULT } from '../ui/palette'

describe('flash scheduler (R10.2)', () => {
  it('caps the alpha and ramps in and out', () => {
    const s = requestFlash(createFlashScheduler(), 1000, 300, NORMAL_ALPHA)
    expect(flashAlphaAt(s, 1000)).toBe(0)
    expect(flashAlphaAt(s, 1000 + RAMP_MS / 2)).toBeCloseTo(REDUCED_ALPHA / 2, 6)
    expect(flashAlphaAt(s, 1000 + RAMP_MS)).toBeCloseTo(REDUCED_ALPHA, 6)
    expect(flashAlphaAt(s, 1299)).toBeCloseTo(REDUCED_ALPHA, 6)
    expect(flashAlphaAt(s, 1300 + RAMP_MS / 2)).toBeCloseTo(REDUCED_ALPHA / 2, 6)
    expect(flashAlphaAt(s, 1300 + RAMP_MS)).toBe(0)
    const wave = simulateWaveform([{ at: 1000, durMs: 300, alpha: NORMAL_ALPHA }], 900, 1600)
    expect(Math.max(...wave)).toBeLessThanOrEqual(REDUCED_ALPHA)
    expect(REDUCED_ALPHA).toBeLessThan(NORMAL_ALPHA)
  })

  it('a short flash is softer, never harder (it cannot reach the cap before it ends)', () => {
    const wave = simulateWaveform([{ at: 0, durMs: 40, alpha: NORMAL_ALPHA }], -5, 400)
    expect(Math.max(...wave)).toBeLessThan(REDUCED_ALPHA / 2)
  })

  it('a request during a flash extends it instead of starting a second one', () => {
    let s = requestFlash(createFlashScheduler(), 0, 300, NORMAL_ALPHA)
    s = requestFlash(s, 200, 300, NORMAL_ALPHA)
    expect(s.onsets.length).toBe(1)
    expect(s.targetEnd).toBe(500)
  })

  it('drops the 4th flash inside one second and accepts it once the window has passed', () => {
    let s = createFlashScheduler()
    for (const t of [0, 400, 800]) { s = requestFlash(s, t, 100, NORMAL_ALPHA) } // 3 separate flashes
    expect(s.onsets).toEqual([0, 400, 800])
    s = requestFlash(s, 950, 100, NORMAL_ALPHA)
    expect(s.onsets).toEqual([0, 400, 800]) // dropped: the 4th within 1 s
    s = requestFlash(s, 1000 + RAMP_MS + 1, 100, NORMAL_ALPHA)
    expect(s.onsets.length).toBe(3) // the first fell out of the window
    expect(s.onsets[2]).toBe(1121)
    expect(MAX_FLASHES_PER_S).toBe(3)
  })

  it('has no hard edges: alpha changes at most cap / ramp per ms', () => {
    const reqs = [0, 150, 700, 900, 1500].map((at) => ({ at, durMs: 300, alpha: 1 }))
    const wave = simulateWaveform(reqs, 0, 3000)
    for (let i = 1; i < wave.length; i++) expect(Math.abs(wave[i] - wave[i - 1])).toBeLessThanOrEqual(REDUCED_ALPHA / RAMP_MS + 1e-9)
  })

  it('counts flashes in a sampled waveform', () => {
    const wave = simulateWaveform([0, 400, 800, 1200, 1600].map((at) => ({ at, durMs: 150, alpha: 1 })), -10, 2500)
    expect(countFlashes(wave)).toBeGreaterThanOrEqual(3)
    expect(maxFlashesPerWindow(wave)).toBeLessThanOrEqual(MAX_FLASHES_PER_S)
  })

  it('is idempotent in time: advancing in small or large steps gives the same alpha (deltaMs based)', () => {
    let a = requestFlash(createFlashScheduler(), 0, 300, 1)
    let b = a
    for (let t = 1; t <= 500; t++) a = advance(a, t)
    b = advance(b, 500)
    expect(a.alpha).toBeCloseTo(b.alpha, 9)
  })

  it('the low-time timer blink is 1 flash per second, within the limit', () => {
    expect(1000 / (2 * TIMER_BLINK_MS)).toBeLessThanOrEqual(MAX_FLASHES_PER_S)
  })

  it('shake scale', () => {
    expect(shakeScale(true)).toBe(REDUCED_SHAKE)
    expect(shakeScale(false)).toBe(1)
  })
})

describe('overlayAlpha', () => {
  it('normal mode is the old constant 0.4 until flashEndTime', () => {
    const key = {}
    expect(overlayAlpha(key, 1300, 1000, false)).toBe(0.4)
    expect(overlayAlpha(key, 1300, 1299, false)).toBe(0.4)
    expect(overlayAlpha(key, 1300, 1300, false)).toBe(0)
    expect(overlayAlpha(key, 0, 1000, false)).toBe(0)
  })
  it('reduced mode never exceeds 0.15 and starts from 0 (no hard onset)', () => {
    const key = {}
    expect(overlayAlpha(key, 1300, 1000, true)).toBe(0)
    let peak = 0
    for (let t = 1000; t < 1500; t += 5) peak = Math.max(peak, overlayAlpha(key, 1300, t, true))
    expect(peak).toBeGreaterThan(0.1)
    expect(peak).toBeLessThanOrEqual(0.15)
    expect(overlayAlpha(key, 1300, 1600, true)).toBe(0)
  })
  it('each canvas has its own flash state', () => {
    const a = {}, b = {}
    overlayAlpha(a, 1300, 1000, true)
    expect(overlayAlpha(b, 0, 1150, true)).toBe(0)
    expect(overlayAlpha(a, 1300, 1150, true)).toBeGreaterThan(0)
  })
  it('skull hits every 100 ms flash at most 3 times per second', () => {
    const key = {}
    let end = 0
    const on: boolean[] = []
    for (let t = 0; t < 4000; t++) {
      if (t % 100 === 0) end = t + 300 // each skull hit sets a new flashEndTime
      on.push(overlayAlpha(key, end, t, true) >= REDUCED_ALPHA / 2)
    }
    expect(maxFlashesPerWindow(on.map((x) => (x ? REDUCED_ALPHA : 0)))).toBeLessThanOrEqual(3)
  })
})

describe('renderFrame with reduced flashing (R10.1)', () => {
  beforeEach(() => resetSettings())
  afterAll(() => resetSettings())

  function recorder() {
    const flashRects: number[] = []
    const translates: Array<[number, number]> = []
    const whiteFills: string[] = []
    const store: Record<string, unknown> = { canvas: { width: 640, height: 480 }, globalAlpha: 1, fillStyle: '' }
    const ctx = new Proxy(store, {
      get: (t, k: string) => {
        if (k in t) return t[k]
        if (k === 'fillRect') return (x: number, y: number, w: number, h: number) => {
          if (x === 0 && y === 0 && w === 640 && h === 480 && t.fillStyle === DEFAULT.danger) flashRects.push(t.globalAlpha as number)
        }
        if (k === 'translate') return (x: number, y: number) => { translates.push([x, y]) }
        return () => ({ addColorStop() {} })
      },
      set: (t, k: string, v) => { t[k] = v; if (k === 'fillStyle' && v === '#ffffff') whiteFills.push(v); return true },
    }) as unknown as CanvasRenderingContext2D
    return { ctx, flashRects, translates, whiteFills }
  }
  const st = (over: Partial<GameState> = {}): GameState => ({ ...createInitialState(1), phase: 'playing', ...over })

  it('normal: flash overlay is 0.4 over the whole canvas', () => {
    initSettings({ storage: null, search: '?reducedflash=0', reducedMotion: false })
    const r = recorder(); renderFrame(r.ctx, st({ flashEndTime: 2000 }), 1000)
    expect(r.flashRects).toEqual([0.4])
  })
  it('reduced: the overlay is at most 0.15 and ramps up', () => {
    initSettings({ storage: null, search: '?reducedflash=1', reducedMotion: false })
    const key = recorder()
    const seen: number[] = []
    // the same canvas object across frames: one recorder canvas per frame would hide the ramp
    const base = key.ctx
    for (const t of [1000, 1030, 1060, 1090, 1150, 1250]) {
      const r = recorder()
      ;(r.ctx as unknown as { canvas: object }).canvas = (base as unknown as { canvas: object }).canvas
      renderFrame(r.ctx, st({ flashEndTime: 1300 }), t)
      seen.push(r.flashRects[0] ?? 0)
    }
    expect(Math.max(...seen)).toBeLessThanOrEqual(0.15)
    expect(seen[1]).toBeGreaterThan(seen[0] - 1e-12)
    expect(seen[3]).toBeGreaterThan(seen[1])
    expect(seen[5]).toBeGreaterThan(0.1)
  })
  it('reduced: shake is a quarter of the amplitude and still draws the same random numbers', () => {
    const spread = (search: string): number => {
      initSettings({ storage: null, search, reducedMotion: false })
      let max = 0
      for (let i = 0; i < 200; i++) {
        const r = recorder(); renderFrame(r.ctx, st({ shakeFrames: 5 }), 0)
        const [x, y] = r.translates[0]
        max = Math.max(max, Math.abs(x), Math.abs(y))
      }
      return max
    }
    const normal = spread('?reducedflash=0'), reduced = spread('?reducedflash=1')
    expect(normal).toBeGreaterThan(0)
    expect(reduced).toBeLessThanOrEqual(normal * 0.26)
    let calls = 0
    const orig = Math.random
    Math.random = () => { calls++; return 0.5 }
    try {
      initSettings({ storage: null, search: '?reducedflash=1', reducedMotion: false }); renderFrame(recorder().ctx, st({ shakeFrames: 5 }), 0)
      const reducedCalls = calls; calls = 0
      initSettings({ storage: null, search: '?reducedflash=0', reducedMotion: false }); renderFrame(recorder().ctx, st({ shakeFrames: 5 }), 0)
      expect(reducedCalls).toBe(calls)
    } finally { Math.random = orig }
  })
  it('reduced: the one-frame white hit silhouette is not drawn', () => {
    const e = makeEnemy({ id: 'g', type: 'ghost', x: 300, y: 200, speed: 1, targetX: 320, targetY: 240, hitbox: { x: 260, y: 160, w: 80, h: 80 }, hitFlashFrames: 1, spawnedAt: -9999 })
    initSettings({ storage: null, search: '?reducedflash=0', reducedMotion: false })
    const a = recorder(); renderFrame(a.ctx, st({ enemies: [e] }), 0)
    initSettings({ storage: null, search: '?reducedflash=1', reducedMotion: false })
    const b = recorder(); renderFrame(b.ctx, st({ enemies: [e] }), 0)
    expect(a.whiteFills.length).toBeGreaterThan(0)
    expect(b.whiteFills.length).toBe(0)
  })
  it('prefers-reduced-motion turns it on by default', () => {
    initSettings({ storage: null, search: '', reducedMotion: true })
    const r = recorder(); renderFrame(r.ctx, st({ flashEndTime: 1300 }), 1150)
    for (const a of r.flashRects) expect(a).toBeLessThanOrEqual(0.15)
  })
})
