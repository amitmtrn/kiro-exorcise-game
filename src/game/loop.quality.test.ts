/**
 * Adaptive quality in the loop (playtest-polish R1, R2.3, R3.1, R3.2): slow frames step the diff grid down,
 * the canvases are resized and re-captured, motion is published as "no new frame" on that tick, a pinned
 * level never moves, and demo mode stays at level 0 / 320 × 180.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  captures: 0, masks: [] as Array<{ w: number; h: number }>, published: [] as boolean[],
  made: [] as Array<{ width: number; height: number }>,
}))

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: vi.fn() }))
vi.mock('./atmosphere', () => ({ drawWebcamTint: vi.fn() }))
vi.mock('../webcam/diff', () => ({
  MOTION_W: 320, MOTION_H: 180,
  captureFrame: () => { h.captures++ },
  calibrateDiffThreshold: async () => {},
  computeMotionMask: (_c: unknown, _p: unknown, w: number, hh: number) => { h.masks.push({ w, h: hh }); return { changed: true, points: [], sampled: 0, moved: 0 } },
}))
vi.mock('./collision', () => ({
  updateMotionPixels: (m: { changed: boolean }) => { h.published.push(m.changed) },
  resolveHits: (st: unknown) => st, lastBanished: [], lastMotionPixels: [], motionFrameSeq: 0, motionCell: { w: 4, h: 4 },
}))
vi.mock('./render', () => ({ renderFrame: vi.fn() }))
vi.mock('../ui/hud', async (orig) => ({ ...(await orig<typeof import('../ui/hud')>()), renderHUD: vi.fn(), hudFontSize: () => 16, HUD_FONT_FAMILY: 'x' }))
vi.mock('../ui/screens', () => ({
  renderStartScreen: vi.fn(), renderStageTitle: vi.fn(), renderSummary: vi.fn(),
  renderGameOver: vi.fn(), renderVictory: vi.fn(), resetVictoryScreen: vi.fn(), resetStartScreen: vi.fn(), resetGameOverScreen: vi.fn(),
}))
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(), isMuted: () => false,
}))

import { startLoop, stopLoop } from './loop'
import { configureQuality, resetQuality, getQuality } from './quality'
import { getMotionGrid, resetMotionGrid } from '../webcam/grid'
import { DemoRuntime } from '../demo/runtime'

function canvas() {
  const c = {
    width: 4, height: 4,
    getContext: () => new Proxy({ drawImage() {}, getImageData: (_x: number, _y: number, w: number, hh: number) => ({ data: new Uint8ClampedArray(w * hh * 4), width: w, height: hh }) } as Record<string, unknown>, {
      get: (t, k: string) => (k === 'canvas' ? c : k in t ? t[k] : () => ({ addColorStop() {} })),
      set: () => true,
    }),
  }
  h.made.push(c)
  return c
}
function ctx(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = { canvas: { width: 800, height: 600 } }
  return new Proxy(store, {
    get: (t, p: string) => (p in t ? t[p] : () => ({ addColorStop() {} })),
    set: (t, p: string, v) => { t[p] = v; return true },
  }) as unknown as CanvasRenderingContext2D
}
let rafQueue: Array<(ts: number) => void> = []
function frame(ts: number): void { const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }
function run(startTs: number, stepMs: number, totalMs: number): number {
  let ts = startTs
  for (let t = 0; t < totalMs; t += stepMs) { ts += stepMs; frame(ts) }
  return ts
}

beforeEach(() => {
  rafQueue = []; h.captures = 0; h.masks = []; h.published = []; h.made = []
  resetQuality(); resetMotionGrid()
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', { now: () => 0 })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals(); resetQuality(); resetMotionGrid() })

describe('auto quality in the loop', () => {
  it('stays at level 0 / 320 x 180 on 16 ms frames', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    run(0, 16, 20_000)
    expect(getQuality()).toBe(0)
    expect(getMotionGrid().w).toBe(320)
  })

  it('slow frames step the grid down; the change tick publishes no new frame and re-captures', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    run(0, 40, 10_000)
    expect(getQuality()).toBeGreaterThanOrEqual(2)
    expect(getMotionGrid().w).toBeLessThan(320)
    const sizes = [...new Set(h.masks.map((m) => `${m.w}x${m.h}`))]
    expect(sizes[0]).toBe('320x180')
    expect(sizes).toContain('160x90')
    // each grid change publishes exactly one "unchanged" mask while the camera always reports a change
    expect(h.published.filter((c) => !c).length).toBe(sizes.length - 1)
    // the motion canvases follow the grid
    const g = getMotionGrid()
    expect(h.made.filter((c) => c.width === g.w && c.height === g.h).length).toBeGreaterThanOrEqual(2)
  })

  it('a pinned level never moves, even on slow frames', async () => {
    configureQuality('high')
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    run(0, 60, 20_000)
    expect(getQuality()).toBe(0)
    expect(getMotionGrid().w).toBe(320)
  })

  it('?quality=low starts on the 96 x 54 grid', async () => {
    configureQuality('low')
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    run(0, 16, 500)
    expect(getMotionGrid()).toMatchObject({ w: 96, h: 54 })
    expect(h.masks.every((m) => m.w === 96 && m.h === 54)).toBe(true)
  })
})

describe('demo mode ignores quality (R3.2)', () => {
  it('runs at level 0 on the full grid even when low is requested and frames are slow', async () => {
    configureQuality('low')
    const rt = new DemoRuntime({ seed: 3, stage: 1, speed: 2, w: 800, h: 600 })
    await startLoop(null, ctx(), ctx(), 1, { demo: rt })
    run(0, 60, 10_000)
    expect(getQuality()).toBe(0)
    expect(getMotionGrid().w).toBe(320)
    expect(h.masks.every((m) => m.w === 320)).toBe(true)
  })
})
