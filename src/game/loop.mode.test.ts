import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  calibrate: async (): Promise<void> => {},
  phases: [] as string[],
  onStart: null as null | ((m: 1 | 2) => void),
  next: null as null | (() => void),
  again: null as null | (() => void),
  menu: null as null | (() => void),
  finalCalls: 0,
  press: null as null | 'next' | 'again' | 'menu',
  noSim: false,
  fireStart: null as null | 1 | 2,
}))
vi.mock('./step', async (orig) => {
  const a = await orig<typeof import('./step')>()
  return { ...a, stepSimulation: (s: never, ...r: unknown[]) => (h.noSim ? s : (a.stepSimulation as (...x: unknown[]) => unknown)(s, ...r)) }
})

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: vi.fn() }))
vi.mock('./atmosphere', () => ({ drawWebcamTint: vi.fn() }))
vi.mock('../webcam/diff', () => ({
  MOTION_W: 4, MOTION_H: 4,
  captureFrame: vi.fn(),
  calibrateDiffThreshold: () => h.calibrate(),
  computeMotionMask: () => ({ changed: false }),
}))
vi.mock('./collision', () => ({ updateMotionPixels: vi.fn(), resolveHits: (st: unknown) => st, lastBanished: [], lastMotionPixels: [], motionFrameSeq: 0, motionCell: { w: 4, h: 4 } }))
vi.mock('./render', () => ({ renderFrame: (_c: unknown, s: { phase: string }) => { h.phases.push(s.phase) } }))
vi.mock('../ui/hud', () => ({
  renderHUD: vi.fn(), hudFontSize: () => 16, HUD_FONT_FAMILY: 'x',
  createHudPulse: () => ({ lastCombo: 1, start: 0 }), drawMuteButton: vi.fn(), muteButtonRect2P: () => ({ x: 0, y: 0, w: 1, h: 1 }),
}))
vi.mock('../ui/splitscreen', () => ({
  drawDivider: vi.fn(), drawSeatOverlay: vi.fn(), FINAL_INPUT_DELAY_MS: 1500,
  renderTwoPlayerSummary: (_c: unknown, _t: unknown, _n: unknown, next: () => void) => { h.next = next; if (h.press === 'next') { h.press = null; next() } },
  renderTwoPlayerFinal: (_c: unknown, _t: unknown, _n: unknown, again: () => void, menu: () => void) => { h.again = again; h.menu = menu; h.finalCalls++; if (h.press === 'again') { h.press = null; again() } else if (h.press === 'menu') { h.press = null; menu() } },
  resetFinalScreen: vi.fn(),
}))
vi.mock('../ui/screens', () => ({
  renderStartScreen: (_c: unknown, _s: unknown, _n: unknown, cb: (m: 1 | 2) => void) => { h.onStart = cb; if (h.fireStart) { const m = h.fireStart; h.fireStart = null; cb(m) } }, renderStageTitle: vi.fn(), renderSummary: vi.fn(),
  renderGameOver: vi.fn(), renderVictory: vi.fn(), resetVictoryScreen: vi.fn(), resetStartScreen: vi.fn(), resetGameOverScreen: vi.fn(),
}))
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(),
}))

import { startLoop, requestStart } from './loop'
import { getPlayerMode, resetPlayerMode } from './playerMode'

function canvas() {
  const base: Record<string, unknown> = { drawImage() {}, clearRect() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }
  const c = {
    width: 4, height: 4,
    getContext: () => new Proxy(base, { // any other 2D call (the per-seat card layers draw buttons) is a no-op
      get: (t, k: string) => (k === 'canvas' ? c : k in t ? t[k] : () => undefined),
      set: () => true,
    }),
  }
  return c
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
  h.next = null; h.again = null; h.menu = null; h.finalCalls = 0; h.press = null; h.noSim = false; h.fireStart = null
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

describe('two-player entry (two-player R6, R7)', () => {
  it('the 2 PLAYERS button and a pending Space / 1 in the same tick start one 2P game, not a 1P one too', async () => {
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    h.fireStart = 2
    requestStart(1) // key request lands in the same tick as the motion button
    frame(32)
    expect(getPlayerMode()).toBe(2) // begin(1) would have flipped it back to 1
    const before = h.phases.length
    frame(48)
    expect(h.phases.slice(before)).toEqual(['stageTitle', 'stageTitle'])
    stop()
  })

  it('2 PLAYERS renders two seats per tick (title cards) instead of the 1P state machine', async () => {
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    requestStart(2)
    frame(32) // start branch consumes the request and creates the session
    const before = h.phases.length
    frame(48) // 2P branch: one frame per seat
    expect(h.phases.slice(before)).toEqual(['stageTitle', 'stageTitle'])
    stop()
  })

  it('1 PLAYER renders exactly one frame per tick as before', async () => {
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    requestStart(1)
    frame(32)
    const before = h.phases.length
    frame(48)
    expect(h.phases.length - before).toBe(1)
    stop()
  })
})

describe('two-player buttons survive the tick (review fixes)', () => {
  let ts = 0
  const step = (): void => { ts += 100; frame(ts) }
  /** Runs frames until `cond` holds (bounded). */
  function until(cond: () => boolean, max = 8000): void {
    for (let i = 0; i < max && !cond(); i++) step()
    expect(cond()).toBe(true)
  }
  const start2P = async () => {
    ts = 0
    const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
    step(); requestStart(2); step()
    return stop
  }

  it('PLAY AGAIN restarts a fresh 2P game (stage title) and MAIN MENU returns to the start screen', async () => {
    const stop = await start2P()
    until(() => h.finalCalls > 0)
    h.press = 'again'
    step() // the button fires inside this tick
    h.phases.length = 0
    step()
    expect(h.phases.slice(0, 2)).toEqual(['stageTitle', 'stageTitle'])
    expect(getPlayerMode()).toBe(2)
    const calls = h.finalCalls
    until(() => h.finalCalls > calls)
    h.press = 'menu'
    step()
    h.phases.length = 0
    step()
    expect(h.phases).toEqual(['start'])
    stop()
  })

  it('motion NEXT on the shared summary advances to the next stage title', async () => {
    h.noSim = true // nobody loses a life, so the stage ends on the timer
    const stop = await start2P()
    until(() => h.next !== null)
    h.press = 'next'
    step() // fires inside the tick; must not be overwritten
    h.phases.length = 0
    step()
    expect(h.phases.slice(0, 2)).toEqual(['stageTitle', 'stageTitle'])
    stop()
  })

  it('keys pressed during a 2P game do not leak to the start screen', async () => {
    const stop = await start2P()
    requestStart(1); step()
    until(() => h.finalCalls > 0)
    h.press = 'menu'
    step()
    h.phases.length = 0
    step(); step()
    expect(h.phases.every((p) => p === 'start')).toBe(true)
    expect(getPlayerMode()).toBe(2)
    stop()
  })
})
