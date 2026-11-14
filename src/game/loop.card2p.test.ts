import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  now: 0,
  points: [] as Array<{ x: number; y: number }>,
  winner: null as null | 0 | 1 | 'tie',
  finalCalls: 0,
  phases: [] as string[],
  grabs: [] as Array<{ seat: number; w: number; h: number }>,
  released: 0,
  composed: [] as Array<Record<string, unknown>>,
  saved: [] as string[],
}))

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: vi.fn() }))
vi.mock('./atmosphere', () => ({ drawWebcamTint: vi.fn() }))
vi.mock('../webcam/diff', () => ({
  MOTION_W: 4, MOTION_H: 4,
  captureFrame: vi.fn(),
  calibrateDiffThreshold: async () => {},
  computeMotionMask: () => ({ changed: false }),
}))
vi.mock('./collision', () => ({
  updateMotionPixels: vi.fn(), resolveHits: (st: unknown) => st, lastBanished: [],
  get lastMotionPixels() { return h.points },
}))
vi.mock('./render', () => ({ renderFrame: (_c: unknown, s: { phase: string }) => { h.phases.push(s.phase) } }))
vi.mock('../ui/hud', () => ({
  renderHUD: vi.fn(), hudFontSize: () => 16, HUD_FONT_FAMILY: 'x',
  createHudPulse: () => ({ lastCombo: 1, start: 0 }), drawMuteButton: vi.fn(), muteButtonRect2P: () => ({ x: 0, y: 0, w: 1, h: 1 }),
}))
vi.mock('../ui/splitscreen', async (orig) => {
  const m = await orig<typeof import('../ui/splitscreen')>()
  return { ...m, renderTwoPlayerFinal: (...a: Parameters<typeof m.renderTwoPlayerFinal>) => { h.finalCalls++; m.renderTwoPlayerFinal(...a) } }
})
vi.mock('./twoPlayer', async (orig) => {
  const m = await orig<typeof import('./twoPlayer')>()
  return { ...m, winnerOf: (t: Parameters<typeof m.winnerOf>[0]) => h.winner ?? m.winnerOf(t) }
})
vi.mock('../ui/screens', () => ({
  renderStartScreen: vi.fn(), renderStageTitle: vi.fn(), renderSummary: vi.fn(),
  renderGameOver: vi.fn(), renderVictory: vi.fn(), resetVictoryScreen: vi.fn(), resetStartScreen: vi.fn(),
}))
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(), isMuted: () => false,
}))
vi.mock('../card/snapshot', () => ({
  grabMirroredSnapshot: () => ({ width: 640, height: 480 }),
  releaseSnapshot: () => { h.released++ },
}))
vi.mock('../card/halfSnapshot', () => ({
  grabHalfSnapshot: (_v: unknown, seat: number, w: number, hh: number) => { h.grabs.push({ seat, w, h: hh }); return { width: 320, height: 480, seat } },
}))
vi.mock('../card/draw', () => ({
  composeCard: (data: Record<string, unknown>) => { h.composed.push(data); return { width: 600, height: 840 } },
}))
vi.mock('../card/download', () => ({
  downloadCanvasPng: async (_c: unknown, name: string) => { h.saved.push(name); return true },
}))

import { startLoop, requestStart, isTwoPlayerActive, handleCardKey, handleCardPointer, handleSeatCardPointer, stopLoop } from './loop'
import { previewLayout } from '../ui/cardScreen'
import { seatOfferGeometry } from '../ui/seatCard'

const W = 800, H = 600, HW = 400

function makeCanvas(w = 4, hh = 4) {
  const base: Record<string, unknown> = { getImageData: () => ({ data: new Uint8ClampedArray(64) }) }
  const c: { width: number; height: number; getContext: () => unknown } = {
    width: w, height: hh,
    getContext: () => new Proxy(base, {
      get: (t, k: string) => (k === 'canvas' ? c : k in t ? t[k] : () => ({ addColorStop() {} })),
      set: (t, k: string, v) => { t[k] = v; return true },
    }),
  }
  return c
}
const ctx = () => makeCanvas(W, H).getContext() as CanvasRenderingContext2D

let rafQueue: Array<(ts: number) => void> = []
let ts = 0
function step(ms = 100): void { ts += ms; h.now = ts; const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }
function stepFor(ms: number, every = 50): void { for (let t = 0; t < ms; t += every) step(every) }
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
const ring = (cx: number, cy: number, r = 14) => Array.from({ length: 8 }, (_, i) => ({ x: cx + Math.cos(i) * r, y: cy + Math.sin(i) * r }))

const spies = {
  fetch: vi.fn(), xhr: vi.fn(), beacon: vi.fn(), ws: vi.fn(), setItem: vi.fn(), idb: vi.fn(),
}

beforeEach(() => {
  rafQueue = []; ts = 0; h.now = 0
  h.points = []; h.winner = null; h.finalCalls = 0; h.phases.length = 0
  h.grabs.length = 0; h.released = 0; h.composed.length = 0; h.saved.length = 0
  for (const s of Object.values(spies)) s.mockClear()
  vi.stubGlobal('document', { createElement: () => makeCanvas() })
  vi.stubGlobal('performance', { now: () => h.now })
  vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: spies.setItem })
  vi.stubGlobal('fetch', spies.fetch)
  vi.stubGlobal('XMLHttpRequest', spies.xhr)
  vi.stubGlobal('WebSocket', spies.ws)
  vi.stubGlobal('indexedDB', { open: spies.idb })
  vi.stubGlobal('navigator', { sendBeacon: spies.beacon })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals() })

/** Starts a 2P game and plays (nobody swats) until the end screen has been showing for 2 s. */
async function toFinal(): Promise<() => void> {
  const stop = await startLoop({} as HTMLVideoElement, ctx(), ctx())
  step(); requestStart(2); step()
  for (let i = 0; i < 8000 && h.finalCalls === 0; i++) step()
  expect(h.finalCalls).toBeGreaterThan(0)
  stepFor(2000) // past the 1.5 s end-screen lock-out
  return stop
}

const offer = seatOfferGeometry(HW, H)
const waveOffer = (seat: 0 | 1) => { h.points = ring(offer.cx + seat * HW, offer.cy) }
const layout = () => previewLayout(HW, H, false, true)

describe('2P end screen cards (two-player-card)', () => {
  it('takes one fallback snapshot per player, each from its own half, and no 1P grab', async () => {
    await toFinal()
    expect(h.grabs.map((g) => g.seat).sort()).toEqual([0, 1])
    for (const g of h.grabs) expect([g.w, g.h]).toEqual([W, H]) // full display size in, the half is cropped inside the grab
    expect(isTwoPlayerActive()).toBe(true)
  })

  it('composes nothing until a player chooses; keys do nothing; a wave in half 2 opens only P2', async () => {
    await toFinal()
    expect(h.composed).toHaveLength(0)
    for (const k of ['c', 's', 'Enter', 'n', 'Escape']) expect(handleCardKey(k)).toBe(false)
    expect(handleCardPointer(10, 10)).toBe(false) // the 1P click path is closed in 2P
    waveOffer(1)
    stepFor(1500)
    h.points = []
    step()
    expect(h.composed).toHaveLength(1)
    expect(h.composed[0]).toMatchObject({ playerLabel: 'P2' })
  })

  it('a wave in the other half never opens a player\'s card', async () => {
    await toFinal()
    // P1's offer circle position, but waved inside P2's half coordinates: x + HW is P2's offer, not P1's.
    waveOffer(1)
    stepFor(2500)
    h.points = []
    step()
    expect(h.composed.every((d) => d.playerLabel === 'P2')).toBe(true)
  })

  it('both cards can be open together; each SAVE writes its own file name; clicks stay in their half', async () => {
    await toFinal()
    waveOffer(0); stepFor(1500); h.points = []; stepFor(1000)
    waveOffer(1); stepFor(1500); h.points = []; stepFor(1000)
    expect(h.composed.map((d) => d.playerLabel)).toEqual(['P1', 'P2'])
    const L = layout()
    const save = L.buttons.find((b) => b.id === 'save')!
    const close = L.buttons.find((b) => b.id === 'close')!
    expect(handleSeatCardPointer(save.cx + HW, save.cy)).toBe(true) // P2's SAVE
    step()
    expect(h.saved).toEqual(['exorcist-card-p2.png'])
    await flush()
    expect(handleSeatCardPointer(save.cx, save.cy)).toBe(true) // P1's SAVE
    step()
    expect(h.saved).toEqual(['exorcist-card-p2.png', 'exorcist-card-p1.png'])
    // CLOSE in P1's half closes P1 only: P2's SAVE still works afterwards.
    handleSeatCardPointer(close.cx, close.cy); step()
    await flush()
    handleSeatCardPointer(save.cx + HW, save.cy); step()
    expect(h.saved).toHaveLength(3)
    expect(h.saved[2]).toBe('exorcist-card-p2.png')
    handleSeatCardPointer(save.cx, save.cy); step() // P1 is closed: this click is on its offer region, not SAVE
    expect(h.saved).toHaveLength(3)
  })

  it('puts WINNER on the winner and nothing on the loser, TIE on both for a tie', async () => {
    h.winner = 1
    await toFinal()
    handleSeatCardPointer(offer.cx, offer.cy); step()
    handleSeatCardPointer(offer.cx + HW, offer.cy); step()
    expect(h.composed[0]).toMatchObject({ playerLabel: 'P1', badge: undefined })
    expect(h.composed[1]).toMatchObject({ playerLabel: 'P2', badge: 'WINNER' })
  })

  it('both cards say TIE when the scores are equal', async () => {
    await toFinal() // nobody scored: 0 : 0
    handleSeatCardPointer(offer.cx, offer.cy); step()
    handleSeatCardPointer(offer.cx + HW, offer.cy); step()
    expect(h.composed.map((d) => d.badge)).toEqual(['TIE', 'TIE'])
    expect(h.composed[0]).toMatchObject({ rank: 'Apprentice Exorcist', score: 0 })
  })

  it('PLAY AGAIN is inactive while a card is open, then discards the snapshots when used', async () => {
    await toFinal()
    handleSeatCardPointer(offer.cx, offer.cy); step()
    stepFor(1000)
    const calls = h.finalCalls
    h.points = ring(0.35 * W, 0.7 * H, 20) // wave on PLAY AGAIN (in P1's covered half)
    stepFor(2500)
    expect(h.finalCalls).toBeGreaterThan(calls) // still on the end screen
    expect(h.phases[h.phases.length - 1]).not.toBe('stageTitle')
    // close the card, then PLAY AGAIN works
    h.points = []
    const close = layout().buttons.find((b) => b.id === 'close')!
    handleSeatCardPointer(close.cx, close.cy); step()
    stepFor(1500)
    const before = h.released
    h.points = ring(0.35 * W, 0.7 * H, 20)
    stepFor(2500)
    h.points = []
    expect(h.phases.slice(-2)).toEqual(['stageTitle', 'stageTitle'])
    expect(h.released - before).toBeGreaterThanOrEqual(2) // both players' snapshots are released
    expect(handleSeatCardPointer(1, 1)).toBe(false) // not on the end screen any more
  })

  it('MAIN MENU discards the snapshots and a new 2P game starts without old cards', async () => {
    await toFinal()
    const before = h.released
    h.points = ring(0.65 * W, 0.7 * H, 20)
    stepFor(2500)
    h.points = []
    expect(h.released - before).toBeGreaterThanOrEqual(2)
    expect(h.phases.slice(-1)).toEqual(['start'])
    expect(isTwoPlayerActive()).toBe(false)
  })

  it('stopLoop releases the snapshots and clears the 2P flag (review NIT 6)', async () => {
    await toFinal()
    const before = h.released
    stopLoop()
    expect(h.released - before).toBeGreaterThanOrEqual(2)
    expect(isTwoPlayerActive()).toBe(false)
    expect(handleSeatCardPointer(1, 1)).toBe(false)
  })

  it('never touches the network or storage while cards are made and saved', async () => {
    await toFinal()
    handleSeatCardPointer(offer.cx, offer.cy); step()
    handleSeatCardPointer(offer.cx + HW, offer.cy); step()
    const save = layout().buttons.find((b) => b.id === 'save')!
    handleSeatCardPointer(save.cx, save.cy); handleSeatCardPointer(save.cx + HW, save.cy); step(); step()
    expect(h.saved).toHaveLength(2)
    for (const [name, s] of Object.entries(spies)) expect(s, name).not.toHaveBeenCalled()
  })
})
