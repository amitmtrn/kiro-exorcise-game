import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ phase: 'gameover' as string }))

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: vi.fn() }))
vi.mock('./atmosphere', () => ({ drawWebcamTint: vi.fn() }))
vi.mock('../webcam/diff', () => ({
  MOTION_W: 4, MOTION_H: 4,
  captureFrame: vi.fn(),
  calibrateDiffThreshold: async () => {},
  computeMotionMask: () => ({ changed: false }),
}))
vi.mock('./collision', () => ({ updateMotionPixels: vi.fn(), resolveHits: vi.fn(), lastMotionPixels: [] }))
vi.mock('./render', () => ({ renderFrame: vi.fn() }))
vi.mock('../ui/hud', async (orig) => ({ ...(await orig<typeof import('../ui/hud')>()), renderHUD: vi.fn(), hudFontSize: () => 16, HUD_FONT_FAMILY: 'x' }))
vi.mock('../ui/screens', () => ({
  renderStartScreen: vi.fn(), renderStageTitle: vi.fn(), renderSummary: vi.fn(),
  renderGameOver: vi.fn(), renderVictory: vi.fn(), resetVictoryScreen: vi.fn(), resetStartScreen: vi.fn(),
}))
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(), isMuted: () => false,
}))
vi.mock('./state', async (orig) => {
  const m = await orig<typeof import('./state')>()
  return { ...m, createInitialState: (...a: Parameters<typeof m.createInitialState>) => ({ ...m.createInitialState(...a), phase: h.phase }) }
})
const grab = vi.hoisted(() => ({ calls: 0 }))
vi.mock('../card/snapshot', () => ({
  grabMirroredSnapshot: () => { grab.calls++; return null }, releaseSnapshot: vi.fn(),
}))

vi.mock('../card/draw', () => ({ composeCard: () => ({ width: 600, height: 840 }) }))

import { startLoop, requestStart, isTwoPlayerActive, handleCardKey, handleCardPointer, isCardPreviewOpen, stopLoop } from './loop'

function canvas() {
  return { width: 4, height: 4, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }) }
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

beforeEach(() => {
  rafQueue = []
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', { now: () => 0 })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('card input outside the end screens (exorcist-card R1.2)', () => {
  it('ignores keys and clicks before any loop runs', () => {
    for (const k of ['c', 'C', 's', 'Enter', 'n', 'Escape']) expect(handleCardKey(k)).toBe(false)
    expect(handleCardPointer(10, 10)).toBe(false)
  })

  it('ignores keys and clicks on the title screen', async () => {
    h.phase = 'start'
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(handleCardKey('c')).toBe(false)
    expect(handleCardPointer(10, 10)).toBe(false)
    stop()
  })
})

describe('card input on an end screen', () => {
  it('accepts card keys on game over, swallows held keys, and stops after the loop stops', async () => {
    h.phase = 'gameover'
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(handleCardKey('c')).toBe(true)
    expect(handleCardKey('c', true)).toBe(true) // auto-repeat is swallowed (never queued)
    expect(handleCardKey('x')).toBe(false)
    expect(handleCardPointer(10, 10)).toBe(true)
    expect(isCardPreviewOpen()).toBe(false)
    frame(32) // drains the queue: opens the card
    expect(isCardPreviewOpen()).toBe(true)
    stop()
    expect(handleCardKey('c')).toBe(false)
    expect(isCardPreviewOpen()).toBe(false)
  })

  it('stopLoop closes the preview too', async () => {
    h.phase = 'victory'
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(handleCardKey('c')).toBe(true)
    stopLoop()
    expect(handleCardKey('c')).toBe(false)
  })
})

describe('card in two-player mode (merge decision: card is 1P only)', () => {
  it('never accepts card keys or clicks and never captures a snapshot', async () => {
    h.phase = 'start'
    grab.calls = 0
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    requestStart(2)
    frame(32) // title consumes the request and begins a 2P game
    for (let i = 0; i < 5; i++) frame(48 + i * 16)
    expect(isTwoPlayerActive()).toBe(true)
    for (const k of ['c', 'C', 's', 'Enter', 'n', 'Escape']) expect(handleCardKey(k)).toBe(false)
    expect(handleCardPointer(10, 10)).toBe(false)
    expect(isCardPreviewOpen()).toBe(false)
    expect(grab.calls).toBe(0)
    stop()
  })
})
