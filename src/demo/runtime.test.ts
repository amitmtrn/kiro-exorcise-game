import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DemoRuntime } from './runtime'
import { DEMO } from './params'
import type { DemoView } from './driver'
import { saveHighScore, loadHighScore } from '../game/state'
import { MOTION_W, MOTION_H } from '../webcam/diff'

const opts = { seed: 7, stage: 1, speed: 2, w: 1280, h: 720 }
const view = (over: Partial<DemoView> = {}): DemoView => ({
  phase: 'playing', stage: 1, bonus: false, enemies: [], w: 1280, h: 720, now: 0, cardOpen: false, hasPhoto: true, noPhoto: false, ...over,
})
const perf = { now: () => 123 }
const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('performance', perf)
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) } })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('fixed step (demo-mode R5.1)', () => {
  it('every processed tick advances by the fixed step times the time scale', () => {
    const rt = new DemoRuntime(opts)
    try {
      const a = rt.beginTick(1000)!, b = rt.beginTick(1016)!, c = rt.beginTick(1100)!
      for (const s of [a, b, c]) expect(s.deltaMs).toBeCloseTo(DEMO.stepMs * 2, 9)
    } finally { rt.dispose() }
  })
  it('skips frames that arrive sooner than minFrameMs (high-refresh displays)', () => {
    const rt = new DemoRuntime(opts)
    try {
      expect(rt.beginTick(1000)).not.toBeNull()
      expect(rt.beginTick(1008)).toBeNull()
      expect(rt.beginTick(1016)).not.toBeNull()
      let processed = 0
      for (let t = 2000; t < 3000; t += 1000 / 144) if (rt.beginTick(t)) processed++
      expect(processed).toBeGreaterThan(60); expect(processed).toBeLessThan(80)
    } finally { rt.dispose() }
  })
  it('the step does not depend on the real timestamps', () => {
    const rt = new DemoRuntime({ ...opts, speed: 3 })
    try {
      expect(rt.beginTick(10)!.deltaMs).toBeCloseTo(DEMO.stepMs * 3, 9)
      expect(rt.beginTick(5000)!.deltaMs).toBeCloseTo(DEMO.stepMs * 3, 9)
    } finally { rt.dispose() }
  })
})

describe('clock and Math.random (R5.2)', () => {
  it('performance.now follows the demo clock and is restored by dispose', () => {
    const rt = new DemoRuntime(opts)
    const t0 = performance.now()
    rt.beginTick(1000)
    expect(performance.now()).toBeCloseTo(t0 + DEMO.stepMs * 2, 6)
    expect(performance.now()).toBe(rt.clockMs)
    rt.dispose()
    expect(performance.now()).toBe(123)
  })

  it('Math.random is seeded, restartable per run, and restored', () => {
    const orig = Math.random
    const rt = new DemoRuntime(opts)
    const a = [Math.random(), Math.random(), Math.random()]
    rt.onRunStart()
    const b = [Math.random(), Math.random(), Math.random()]
    expect(b).toEqual(a)
    rt.dispose()
    expect(Math.random).toBe(orig)
    const rt2 = new DemoRuntime({ ...opts, seed: 8 })
    const c = [Math.random(), Math.random(), Math.random()]
    rt2.dispose()
    expect(c).not.toEqual(a)
  })

  it('two runtimes with the same seed produce the same random stream', () => {
    const run = () => { const rt = new DemoRuntime(opts); const v = [Math.random(), Math.random()]; rt.dispose(); return v }
    expect(run()).toEqual(run())
  })

  it('dispose twice is harmless', () => {
    const rt = new DemoRuntime(opts)
    rt.dispose(); rt.dispose()
    expect(performance.now()).toBe(123)
  })
})

describe('persistence and frames', () => {
  it('turns score persistence off while it exists and back on after', () => {
    const rt = new DemoRuntime(opts)
    saveHighScore(999)
    expect(storage.size).toBe(0)
    expect(loadHighScore()).toBe(0)
    rt.dispose()
    saveHighScore(5)
    expect(storage.get('exorcise-highscore')).toBe('5')
  })

  it('frame() returns motion-sized frames and moves the hand along the driver path', () => {
    const rt = new DemoRuntime(opts)
    try {
      rt.beginTick(1000)
      const f = rt.frame(view({ phase: 'start' }))
      expect(f.cur.width).toBe(MOTION_W); expect(f.cur.height).toBe(MOTION_H)
      expect(rt.hand.x).toBeGreaterThan(0)
    } finally { rt.dispose() }
  })

  it('clamps the start stage to 1–5', () => {
    for (const [given, want] of [[0, 1], [3, 3], [9, 5]] as const) {
      const rt = new DemoRuntime({ ...opts, stage: given })
      expect(rt.startStage).toBe(want)
      rt.dispose()
    }
  })
})
