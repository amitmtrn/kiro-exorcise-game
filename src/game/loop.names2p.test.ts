import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  now: 0,
  seq: 0,
  points: [] as Array<{ x: number; y: number }>,
  winner: null as null | 0 | 1 | 'tie',
  finalCalls: 0,
  phases: [] as string[],
  grabs: [] as Array<{ seat: number; w: number; h: number }>,
  released: 0,
  composed: [] as Array<Record<string, unknown>>,
  saved: [] as string[],
  scores: [0, 0] as number[],
  stages: [1, 1] as number[],
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
  get motionFrameSeq() { return h.seq },
  motionCell: { w: 4, h: 4 },
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
  // The game starts on its end screen with the scores of the test (h.scores), so names are asked at once.
  const createTwoPlayer = () => {
    const t = m.createTwoPlayer()
    return {
      ...t, phase: 'final' as const,
      seats: t.seats.map((s, i) => ({ ...s, phase: i === 0 ? 'gameover' : 'victory', score: h.scores[i], stage: h.stages[i] })) as typeof t.seats,
    }
  }
  return { ...m, createTwoPlayer, winnerOf: (t: Parameters<typeof m.winnerOf>[0]) => h.winner ?? m.winnerOf(t) }
})
vi.mock('../ui/screens', () => ({
  renderStartScreen: vi.fn(), renderStageTitle: vi.fn(), renderSummary: vi.fn(),
  renderGameOver: vi.fn(), renderVictory: vi.fn(), resetVictoryScreen: vi.fn(), resetStartScreen: vi.fn(), resetGameOverScreen: vi.fn(),
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

import { startLoop, requestStart, stopLoop, handleNameKey, isNameEntryOpen, handleSeatCardPointer } from './loop'
import { areaButtons } from '../ui/layout'
import { STORAGE_KEY } from './highScores'
import type { ScoreEntry } from './highScores'
import { ENTRY_LOCK_MS, DWELL_MS } from '../ui/motionButton'

const W = 800, H = 600, HW = 400

function makeCanvas(w = 4, hh = 4) {
  const base: Record<string, unknown> = { getImageData: () => ({ data: new Uint8ClampedArray(64) }) }
  const c: { width: number; height: number; getContext: () => unknown } = {
    width: w, height: hh,
    getContext: () => new Proxy(base, {
      get: (t, k: string) => (k === 'canvas' ? c : k in t ? t[k] : () => ({ addColorStop() {}, width: 10 })),
      set: (t, k: string, v) => { t[k] = v; return true },
    }),
  }
  return c
}
const ctx = () => makeCanvas(W, H).getContext() as CanvasRenderingContext2D
let rafQueue: Array<(ts: number) => void> = []
let ts = 0
function step(ms = 50): void { ts += ms; h.seq++; h.now = ts; const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }
function stepFor(ms: number): void { for (let t = 0; t < ms; t += 50) step(50) }
const ring = (cx: number, cy: number, r = 30) => {
  const out: Array<{ x: number; y: number }> = []
  for (let y = cy - r; y <= cy + r; y += 4) for (let x = cx - r; x <= cx + r; x += 4) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out.push({ x, y })
  return out
}
const btn = (seat: 0 | 1, id: string) => { const b = areaButtons('name2p', HW, H, seat).find((x) => x.id === id)!; return { x: b.cx + seat * HW, y: b.cy, r: b.r } }
let store: Record<string, string> = {}
const table = (): ScoreEntry[] => JSON.parse(store[STORAGE_KEY] ?? '[]')

beforeEach(() => {
  rafQueue = []; ts = 0; h.now = 0; h.points = []; h.finalCalls = 0; store = {}
  vi.stubGlobal('document', { createElement: () => makeCanvas() })
  vi.stubGlobal('performance', { now: () => h.now })
  vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = v } })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals() })

async function startFinal(): Promise<void> {
  await startLoop({} as HTMLVideoElement, ctx(), ctx())
  step(); requestStart(2); step(); step()
}

describe('two-player names (more-content R11)', () => {
  it('records both seats with mode 2P and their own stage, and holds the end buttons back', async () => {
    h.scores = [3000, 5000]; h.stages = [4, 6]
    await startFinal()
    const t = table()
    expect(t.map((e) => [e.score, e.stage, e.mode])).toEqual([[5000, 6, '2P'], [3000, 4, '2P']])
    for (const e of t) expect(e.name).toMatch(/^[A-Z]+-[0-9A-F]{2}$/)
    expect(isNameEntryOpen()).toBe(true)
    expect(h.finalCalls).toBe(0)
    expect(handleSeatCardPointer(1, 1)).toBe(true) // a tap goes to the name screen (it hits no button here)
    step()
    expect(table().map((e) => e.name)).toEqual(t.map((e) => e.name))
  })
  it('a tap on a half\'s OK button names that half, and only that half (pointer path)', async () => {
    h.scores = [3000, 5000]; h.stages = [4, 6]
    await startFinal()
    const tap = (b: { x: number; y: number }) => { expect(handleSeatCardPointer(b.x, b.y)).toBe(true); step() }
    tap(btn(1, 'stepA')) // first step picks a letter
    for (let i = 0; i < 3; i++) tap(btn(1, 'ok'))
    expect(table().find((e) => e.score === 5000)!.name).toBe('AAA')
    expect(isNameEntryOpen()).toBe(true) // the left half is still naming
    expect(table().find((e) => e.score === 3000)!.name).toMatch(/^[A-Z]+-[0-9A-F]{2}$/)
  })
  it('each half names itself with its own buttons; one half done does not end the other; buttons after both', async () => {
    h.scores = [3000, 5000]; h.stages = [4, 6]
    await startFinal()
    stepFor(ENTRY_LOCK_MS + 200)
    // P2 (right half): ▶ (its stacked button) twice (the first replaces the default with A), then OK three times
    const press = (b: { x: number; y: number; r: number }) => {
      h.points = ring(b.x, b.y, b.r * 0.9); stepFor(DWELL_MS + 200)
      h.points = []; stepFor(400)
    }
    press(btn(1, 'stepA'))
    press(btn(1, 'stepA'))
    for (let i = 0; i < 3; i++) press(btn(1, 'ok'))
    expect(table().find((e) => e.score === 5000)!.name).toBe('BAA')
    expect(isNameEntryOpen()).toBe(true) // P1 still naming
    expect(h.finalCalls).toBe(0)
    // P1 types on the keyboard
    for (const k of ['j', 'o', 'Enter']) handleNameKey(k)
    step(); step()
    expect(table().find((e) => e.score === 3000)!.name).toBe('JO')
    expect(isNameEntryOpen()).toBe(false)
    step()
    expect(h.finalCalls).toBeGreaterThan(0)
  })
  it('a seat with no score is not recorded and waits; the other names alone', async () => {
    h.scores = [0, 800]; h.stages = [1, 2]
    await startFinal()
    expect(table()).toHaveLength(1)
    handleNameKey('Enter') // keys only edit P1, who has no entry: nothing happens
    step()
    expect(isNameEntryOpen()).toBe(true)
    stepFor(10_500) // P2's untouched default is accepted after 10 s
    expect(isNameEntryOpen()).toBe(false)
    step()
    expect(h.finalCalls).toBeGreaterThan(0)
  })
  it('no scores: straight to the end screen', async () => {
    h.scores = [0, 0]
    await startFinal()
    expect(isNameEntryOpen()).toBe(false)
    expect(h.finalCalls).toBeGreaterThan(0)
    expect(store[STORAGE_KEY]).toBeUndefined()
  })
})
