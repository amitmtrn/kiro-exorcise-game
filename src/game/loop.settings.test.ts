/** The settings panel on the title screen (playtest-polish R7.2): buttons and Space do nothing while it is open. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ phases: [] as string[] }))

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: vi.fn() }))
vi.mock('./atmosphere', () => ({ drawWebcamTint: vi.fn() }))
vi.mock('../webcam/diff', () => ({
  MOTION_W: 4, MOTION_H: 4, captureFrame: vi.fn(), calibrateDiffThreshold: async () => {},
  computeMotionMask: () => ({ changed: false }),
}))
vi.mock('./collision', () => ({ updateMotionPixels: vi.fn(), resolveHits: vi.fn(), motionFrameSeq: 0, motionCell: { w: 4, h: 4 } }))
vi.mock('./render', () => ({ renderFrame: (_c: unknown, s: { phase: string }) => { h.phases.push(s.phase) } }))
vi.mock('../ui/hud', () => ({ renderHUD: vi.fn(), hudFontSize: () => 16, HUD_FONT_FAMILY: 'x' }))
vi.mock('../ui/screens', () => ({
  renderStartScreen: vi.fn(), renderStageTitle: vi.fn(), renderSummary: vi.fn(),
  renderGameOver: vi.fn(), renderVictory: vi.fn(), resetVictoryScreen: vi.fn(), resetStartScreen: vi.fn(), resetGameOverScreen: vi.fn(),
}))
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(),
}))

import { startLoop, requestStart, stopLoop } from './loop'
import { renderStartScreen, resetStartScreen } from '../ui/screens'
import { openPanel, closePanel, isPanelOpen } from '../ui/settingsPanel'
import { resetSettings, initSettings } from '../settings/runtime'

function canvas() {
  return { width: 4, height: 4, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }) }
}
function ctx(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = { canvas: { width: 800, height: 600 } }
  return new Proxy(store, { get: (t, k: string) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k: string, v) => { t[k] = v; return true } }) as unknown as CanvasRenderingContext2D
}
let rafQueue: Array<(ts: number) => void> = []
function frame(ts: number): void { const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }

beforeEach(() => {
  h.phases.length = 0; rafQueue = []
  resetSettings(); initSettings({ storage: null, search: '', reducedMotion: false }); closePanel()
  vi.mocked(renderStartScreen).mockClear(); vi.mocked(resetStartScreen).mockClear()
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', { now: () => 0 })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals() })

describe('settings panel on the title screen', () => {
  it('while open the title buttons are not rendered (so they cannot press) and Space does not start', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(vi.mocked(renderStartScreen)).toHaveBeenCalledTimes(1)
    openPanel()
    requestStart()
    frame(32); frame(48)
    expect(vi.mocked(renderStartScreen)).toHaveBeenCalledTimes(1)
    expect(h.phases[h.phases.length - 1]).toBe('start')
    expect(isPanelOpen()).toBe(true)
  })

  it('closing restarts the buttons lock-out and the start screen is back; the gear is drawn outside demo', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    openPanel(); frame(32)
    closePanel(); vi.mocked(resetStartScreen).mockClear()
    frame(48)
    expect(vi.mocked(resetStartScreen)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(renderStartScreen)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(renderStartScreen).mock.calls[1][4]).toEqual({ gear: true })
  })

  it('stopLoop closes the panel', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16); openPanel(); stopLoop()
    expect(isPanelOpen()).toBe(false)
  })
})
