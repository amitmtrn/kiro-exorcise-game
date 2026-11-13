import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  calibrate: async (): Promise<void> => {},
  phases: [] as string[],
  onStart: null as null | ((m: 1 | 2) => void),
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
  renderStartScreen: (_c: unknown, _s: unknown, _n: unknown, cb: (m: 1 | 2) => void) => { h.onStart = cb }, renderStageTitle: vi.fn(), renderSummary: vi.fn(),
  renderGameOver: vi.fn(), renderVictory: vi.fn(), resetVictoryScreen: vi.fn(),
}))
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(),
}))

import { startLoop, requestStart } from './loop'
import { getPlayerMode, resetPlayerMode } from './playerMode'

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
  resetPlayerMode()
  h.onStart = null
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

describe('mode selection on the start screen (two-player R6)', () => {
  it('defaults to 1 player and Space starts a game in the remembered mode', async () => {
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    expect(getPlayerMode()).toBe(1)
    requestStart()
    frame(16); frame(32)
    expect(h.phases[h.phases.length - 1]).not.toBe('start')
    expect(getPlayerMode()).toBe(1)
    stop()
  })

  it('keys 1 and 2 pick the mode and start the game', async () => {
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    requestStart(2)
    frame(16); frame(32)
    expect(getPlayerMode()).toBe(2)
    expect(h.phases[h.phases.length - 1]).not.toBe('start')
    stop()
  })

  it('a motion button start (onStart) remembers the chosen mode', async () => {
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    h.onStart!(2)
    frame(32)
    expect(getPlayerMode()).toBe(2)
    expect(h.phases[h.phases.length - 1]).not.toBe('start')
    stop()
  })

  it('Space after choosing 2 players keeps 2 players', async () => {
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    h.onStart!(2)
    stop()
    // second session in the same page: the remembered mode survives, Space does not reset it
    const stop2 = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    requestStart()
    frame(16); frame(32)
    expect(getPlayerMode()).toBe(2)
    stop2()
  })

  it('a 1 / 2 pressed outside the start screen is ignored', async () => {
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    requestStart(1)
    frame(16); frame(32) // game started (stage title)
    requestStart(2)
    frame(48)
    expect(getPlayerMode()).toBe(1)
    stop()
  })
})
