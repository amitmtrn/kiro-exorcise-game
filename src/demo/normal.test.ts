/**
 * Normal mode is unaffected by demo mode (demo-mode R7.1): a loop started with a video reads the
 * camera, draws no DEMO badge or ghost hand, and leaves performance.now, Math.random and the
 * high-score persistence alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ phase: 'start' as string, drawWebcam: 0, capture: 0, calibrate: 0, drawn: [] as string[] }))

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: () => { h.drawWebcam++ } }))
vi.mock('../game/atmosphere', () => ({ drawWebcamTint: vi.fn() }))
vi.mock('../webcam/diff', () => ({
  MOTION_W: 4, MOTION_H: 4,
  captureFrame: () => { h.capture++ },
  calibrateDiffThreshold: async () => { h.calibrate++ },
  computeMotionMask: () => ({ changed: false, points: [], sampled: 0, moved: 0 }),
}))
vi.mock('../game/collision', () => ({ updateMotionPixels: vi.fn(), resolveHits: (st: unknown) => st, lastBanished: [], lastMotionPixels: [], motionFrameSeq: 0, motionCell: { w: 4, h: 4 } }))
vi.mock('../game/render', () => ({ renderFrame: vi.fn() }))
vi.mock('../ui/hud', async (orig) => ({ ...(await orig<typeof import('../ui/hud')>()), renderHUD: vi.fn(), hudFontSize: () => 16, HUD_FONT_FAMILY: 'x' }))
vi.mock('../ui/screens', () => ({
  renderStartScreen: vi.fn(), renderStageTitle: vi.fn(), renderSummary: vi.fn(),
  renderGameOver: vi.fn(), renderVictory: vi.fn(), resetVictoryScreen: vi.fn(), resetStartScreen: vi.fn(), resetGameOverScreen: vi.fn(),
}))
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(), isMuted: () => false,
}))
vi.mock('../game/state', async (orig) => {
  const m = await orig<typeof import('../game/state')>()
  return { ...m, createInitialState: (...a: Parameters<typeof m.createInitialState>) => ({ ...m.createInitialState(...a), phase: h.phase }) }
})
vi.mock('../card/draw', () => ({ composeCard: () => ({ width: 600, height: 840 }) }))

import { startLoop, stopLoop, isStartScreenVisible } from '../game/loop'
import { saveHighScore } from '../game/state'
import { DemoRuntime } from './runtime'
import { renderFrame } from '../game/render'

function canvas() {
  const base: Record<string, unknown> = { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }
  const c = {
    width: 4, height: 4,
    getContext: () => new Proxy(base, {
      get: (t, k: string) => (k === 'canvas' ? c : k in t ? t[k] : () => ({ addColorStop() {} })),
      set: () => true,
    }),
  }
  return c
}
function ctx(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = { canvas: { width: 800, height: 600 } }
  return new Proxy(store, {
    get: (t, p: string) => (p in t ? t[p] : p === 'fillText' ? (text: string) => { h.drawn.push(text) } : () => ({ addColorStop() {} })),
    set: (t, p: string, v) => { t[p] = v; return true },
  }) as unknown as CanvasRenderingContext2D
}
let rafQueue: Array<(ts: number) => void> = []
function frame(ts: number): void { const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }
const store = new Map<string, string>()
const perf = { now: () => 0 }

beforeEach(() => {
  rafQueue = []; store.clear()
  h.phase = 'start'; h.drawWebcam = 0; h.capture = 0; h.calibrate = 0; h.drawn = []
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', perf)
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals() })

describe('normal mode with a video', () => {
  it('calibrates and reads the camera, and draws no DEMO badge', async () => {
    const random = Math.random
    const nowFn = performance.now
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    for (let i = 1; i <= 5; i++) frame(i * 16)
    expect(h.calibrate).toBe(1)
    expect(h.capture).toBeGreaterThanOrEqual(5)
    expect(h.drawWebcam).toBeGreaterThanOrEqual(5)
    expect(h.drawn).not.toContain('DEMO')
    expect(Math.random).toBe(random)
    expect(performance.now).toBe(nowFn)
  })

  it('reports the title screen to main.ts (the G toggle works only there)', async () => {
    expect(isStartScreenVisible()).toBe(false)
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(isStartScreenVisible()).toBe(true)
    stopLoop()
    expect(isStartScreenVisible()).toBe(false)
  })

  it('does not report the title screen on other phases', async () => {
    h.phase = 'gameover'
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(isStartScreenVisible()).toBe(false)
  })

  it('still persists the high score', () => {
    saveHighScore(1234)
    expect(store.get('exorcise-highscore')).toBe('1234')
  })
})

describe('demo runtime lifetime (demo-mode design: dispose on stopLoop)', () => {
  const opts = { seed: 3, stage: 1, speed: 2, w: 800, h: 600 }

  it('stopLoop restores performance.now and Math.random', async () => {
    const random = Math.random
    const nowFn = performance.now
    const rt = new DemoRuntime(opts)
    expect(Math.random).not.toBe(random)
    await startLoop(null, ctx(), ctx(), 1, { demo: rt })
    stopLoop()
    expect(Math.random).toBe(random)
    expect(performance.now).toBe(nowFn)
  })

  it('an exception in a demo tick stops the loop and restores the globals', async () => {
    const random = Math.random
    const nowFn = performance.now
    const rt = new DemoRuntime(opts)
    await startLoop(null, ctx(), ctx(), 1, { demo: rt })
    vi.mocked(renderFrame).mockImplementationOnce(() => { throw new Error('boom') })
    expect(() => frame(1000)).toThrow('boom')
    expect(Math.random).toBe(random)
    expect(performance.now).toBe(nowFn)
  })
})
