/**
 * Video stutter check (playtest1-fixes R6): the webcam video is drawn on the webcam canvas every tick at the full
 * canvas size at every quality level; the adaptive level only changes the motion grid and the effects.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  captures: 0, masks: [] as Array<{ w: number; h: number }>, published: [] as boolean[],
  made: [] as Array<{ width: number; height: number }>,
  draws: [] as Array<{ w: number; h: number }>,
}))

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: (ctx: { canvas: { width: number; height: number } }) => { h.draws.push({ w: ctx.canvas.width, h: ctx.canvas.height }) } }))
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
  rafQueue = []; h.draws = []; h.captures = 0; h.masks = []; h.published = []; h.made = []
  resetQuality(); resetMotionGrid()
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', { now: () => 0 })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals(); resetQuality(); resetMotionGrid() })


describe('the webcam video is drawn every tick at full resolution', () => {
  for (const mode of ['high', 'med', 'low'] as const) {
    it(`pinned ${mode}: one full-size draw per tick (the grid is ${mode === 'low' ? 'small' : 'whatever'}, the video is not)`, async () => {
      configureQuality(mode)
      await startLoop({} as HTMLVideoElement, ctx(), ctx())
      const calibration = h.draws.length // the first frame behind the "hold still" banner
      run(0, 16, 1600) // 100 ticks
      expect(h.draws.length - calibration).toBe(100)
      expect(h.draws.every((d) => d.w === 800 && d.h === 600)).toBe(true)
      if (mode === 'low') expect(getMotionGrid().w).toBe(96)
    })
  }
  it('auto quality on slow frames: the grid steps down but no tick skips or shrinks the video draw', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    const calibration = h.draws.length
    run(0, 40, 10_000) // 250 ticks
    expect(getQuality()).toBeGreaterThanOrEqual(2)
    expect(getMotionGrid().w).toBeLessThan(320)
    expect(h.draws.length - calibration).toBe(250)
    expect(h.draws.every((d) => d.w === 800 && d.h === 600)).toBe(true)
  })
})
