import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  calibrate: async (): Promise<void> => {},
  phases: [] as string[],
}))

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: vi.fn() }))
vi.mock('./atmosphere', () => ({ drawWebcamTint: vi.fn() }))
vi.mock('../webcam/diff', () => ({
  MOTION_W: 4, MOTION_H: 4,
  captureFrame: vi.fn(),
  calibrateDiffThreshold: () => h.calibrate(),
  computeMotionMask: () => ({ changed: false }),
}))
vi.mock('./collision', () => ({ updateMotionPixels: vi.fn(), resolveHits: vi.fn() }))
vi.mock('./render', () => ({ renderFrame: (_c: unknown, s: { phase: string }) => { h.phases.push(s.phase) } }))
vi.mock('../ui/hud', () => ({ renderHUD: vi.fn(), hudFontSize: () => 16, HUD_FONT_FAMILY: 'x' }))
vi.mock('../ui/screens', () => ({
  renderStartScreen: vi.fn(), renderStageTitle: vi.fn(), renderSummary: vi.fn(),
  renderGameOver: vi.fn(), renderVictory: vi.fn(), resetVictoryScreen: vi.fn(), resetStartScreen: vi.fn(),
}))
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(),
}))

import { startLoop, requestStart } from './loop'

function canvas() {
  return { width: 4, height: 4, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }) }
}
function ctx(): CanvasRenderingContext2D {
  return {
    canvas: { width: 800, height: 600 }, save() {}, restore() {}, clearRect() {}, fillRect() {}, fillText() {}, drawImage() {},
  } as unknown as CanvasRenderingContext2D
}

let rafQueue: Array<(ts: number) => void> = []
function frame(ts: number): void { const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }

beforeEach(() => {
  h.phases.length = 0
  h.calibrate = async () => {}
  rafQueue = []
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', { now: () => 0 })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('start latch (R8.1)', () => {
  it('a Space requested before startLoop does not start the game', async () => {
    requestStart()
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(h.phases[h.phases.length - 1]).toBe('start')
    stop()
  })

  it('a Space requested during calibration does not start the game', async () => {
    h.calibrate = async () => { requestStart() }
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(h.phases[h.phases.length - 1]).toBe('start')
    stop()
  })

  it('a Space on the title screen still starts the game', async () => {
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    requestStart()
    frame(16)
    frame(32)
    expect(h.phases[h.phases.length - 1]).not.toBe('start')
    stop()
  })
})
