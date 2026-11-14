import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ phase: 'gameover' as string, sessions: [] as unknown[], badges: [] as Array<string | undefined>, toSummary: false }))

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: vi.fn() }))
vi.mock('./atmosphere', () => ({ drawWebcamTint: vi.fn() }))
vi.mock('../webcam/diff', () => ({
  MOTION_W: 4, MOTION_H: 4,
  captureFrame: vi.fn(),
  calibrateDiffThreshold: async () => {},
  computeMotionMask: () => ({ changed: false }),
}))
vi.mock('./collision', () => ({ updateMotionPixels: vi.fn(), resolveHits: (st: unknown) => st, lastBanished: [], lastMotionPixels: [], motionFrameSeq: 0, motionCell: { w: 4, h: 4 } }))
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
vi.mock('./state', async (orig) => {
  const m = await orig<typeof import('./state')>()
  return { ...m, createInitialState: (...a: Parameters<typeof m.createInitialState>) => ({ ...m.createInitialState(...a), phase: h.phase }),
    tickTimer: (...a: Parameters<typeof m.tickTimer>) => (h.toSummary ? { ...a[0], phase: 'summary' as const } : m.tickTimer(...a)) }
})
const grab = vi.hoisted(() => ({ calls: 0 }))
vi.mock('../card/snapshot', () => ({
  grabMirroredSnapshot: () => { grab.calls++; return null }, releaseSnapshot: vi.fn(),
}))

vi.mock('../card/session', async (orig) => {
  const m = await orig<typeof import('../card/session')>()
  class Recorded<P, C> extends m.CardSession<P, C> {
    constructor(deps: ConstructorParameters<typeof m.CardSession<P, C>>[0]) { super(deps); h.sessions.push(this) }
  }
  return { ...m, CardSession: Recorded }
})

vi.mock('../card/draw', () => ({ composeCard: (d: { badge?: string }) => { h.badges.push(d.badge); return { width: 600, height: 840 } } }))

import { startLoop, requestStart, isTwoPlayerActive, handleCardKey, handleCardPointer, handleSeatCardPointer, isCardPreviewOpen, stopLoop } from './loop'
import type { CardSession } from '../card/session'

function canvas() {
  const base: Record<string, unknown> = { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }
  const c = {
    width: 4, height: 4,
    getContext: () => new Proxy(base, { // other 2D calls (2P overlays, per-seat card layers) are no-ops
      get: (t, k: string) => (k === 'canvas' ? c : k in t ? t[k] : () => ({ addColorStop() {} })),
      set: () => true,
    }),
  }
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

describe('high score storage on end screens (more-content R8.4)', () => {
  for (const phase of ['summary', 'gameover', 'victory']) {
    it(`${phase}: the best score is stored once on entry, not every frame`, async () => {
      h.phase = phase
      const reads = { get: 0, set: 0 }
      vi.stubGlobal('localStorage', { getItem: () => { reads.get++; return null }, setItem: () => { reads.set++ } })
      const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
      frame(16)
      const after1 = { ...reads }
      for (let t = 32; t <= 160; t += 16) frame(t)
      expect(reads).toEqual(after1)
      stop()
    })
  }
})

describe('high score storage on a stage clear (more-content R8.4)', () => {
  it('playing → summary writes the best score exactly once, and nothing on later frames', async () => {
    h.phase = 'playing'
    h.toSummary = true
    const writes: string[] = []
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: (k: string) => { writes.push(k) } })
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    h.toSummary = false
    frame(32)
    const best = () => writes.filter((k) => k === 'exorcise-highscore').length
    expect(best()).toBe(1)
    const total = writes.length
    for (let t = 48; t <= 160; t += 16) frame(t)
    expect(writes.length).toBe(total)
    stop()
  })
})

describe('finale badge (more-content R5.6)', () => {
  for (const [phase, want] of [['victory', 'FINALE CLEARED'], ['gameover', undefined]] as const) {
    it(`${phase}: card badge ${want ?? 'none'}`, async () => {
      h.phase = phase
      h.badges = []
      const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
      frame(16)
      handleCardKey('c')
      frame(32)
      expect(h.badges).toEqual([want])
      stop()
    })
  }
})

describe('1P card in two-player mode (card is per seat, never the 1P session)', () => {
  it('drives a 2P game to the end screen: the 1P session and 1P snapshot stay idle, 1P card input stays closed', async () => {
    h.phase = 'start'
    h.sessions.length = 0
    grab.calls = 0
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    requestStart(2)
    frame(32) // title consumes the request and begins a 2P game
    expect(isTwoPlayerActive()).toBe(true)
    const [oneP, seat0, seat1] = h.sessions as Array<CardSession<unknown, unknown>>
    const observe1P = vi.spyOn(oneP, 'observe')
    const observeSeat0 = vi.spyOn(seat0, 'observe')
    const observeSeat1 = vi.spyOn(seat1, 'observe')
    let ts = 32
    for (let i = 0; i < 8000 && !handleSeatCardPointer(1, 1); i++) frame(ts += 100) // true only on the 2P end screen
    expect(handleSeatCardPointer(1, 1)).toBe(true)
    for (const k of ['c', 'C', 's', 'Enter', 'n', 'Escape']) expect(handleCardKey(k)).toBe(false)
    expect(handleCardPointer(10, 10)).toBe(false)
    expect(isCardPreviewOpen()).toBe(false)
    expect(grab.calls).toBe(0)
    expect(observe1P).not.toHaveBeenCalled() // the guard in loop.ts: no 1P run stats in 2P
    expect(observeSeat0.mock.calls.length).toBeGreaterThan(10)
    expect(observeSeat1.mock.calls.length).toBe(observeSeat0.mock.calls.length)
    stop()
  })
})
