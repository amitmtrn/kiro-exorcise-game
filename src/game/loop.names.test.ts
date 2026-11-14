/** 1P high-score recording and the name screen in the loop (more-content R8, R9, R10). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ phase: 'gameover' as string, score: 4200, stage: 3 }))

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: vi.fn() }))
vi.mock('./atmosphere', () => ({ drawWebcamTint: vi.fn() }))
vi.mock('../webcam/diff', () => ({
  MOTION_W: 4, MOTION_H: 4, captureFrame: vi.fn(), calibrateDiffThreshold: async () => {},
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
  return { ...m, createInitialState: (...a: Parameters<typeof m.createInitialState>) => ({ ...m.createInitialState(...a), phase: h.phase, score: h.score, stage: h.stage }) }
})
vi.mock('../card/snapshot', () => ({ grabMirroredSnapshot: () => null, releaseSnapshot: vi.fn() }))
vi.mock('../card/draw', () => ({ composeCard: () => ({ width: 600, height: 840 }) }))

import { startLoop, stopLoop, handleNameKey, isNameEntryOpen, handleCardKey } from './loop'
import { renderGameOver, renderVictory, renderStartScreen, resetGameOverScreen } from '../ui/screens'
import { IDLE_ACCEPT_MS } from './nameEntry'
import { STORAGE_KEY } from './highScores'
import type { ScoreEntry } from './highScores'

function canvas() {
  const base: Record<string, unknown> = { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }
  const c = { width: 4, height: 4, getContext: () => new Proxy(base, { get: (t, k: string) => (k === 'canvas' ? c : k in t ? t[k] : () => ({ addColorStop() {} })), set: () => true }) }
  return c
}
function ctx(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = { canvas: { width: 1280, height: 720 } }
  return new Proxy(store, {
    get: (t, p: string) => (p in t ? t[p] : () => ({ addColorStop() {}, width: 10 })),
    set: (t, p: string, v) => { t[p] = v; return true },
  }) as unknown as CanvasRenderingContext2D
}
let rafQueue: Array<(ts: number) => void> = []
let clock = 0
function frame(ts: number): void { clock = ts; const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }
let store: Record<string, string> = {}
const table = (): ScoreEntry[] => JSON.parse(store[STORAGE_KEY] ?? '[]')

beforeEach(() => {
  rafQueue = []; store = {}; clock = 0
  h.phase = 'gameover'; h.score = 4200; h.stage = 3
  vi.mocked(renderGameOver).mockClear(); vi.mocked(renderVictory).mockClear(); vi.mocked(renderStartScreen).mockClear(); vi.mocked(resetGameOverScreen).mockClear()
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', { now: () => clock })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = v } })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals() })

describe('1P run end', () => {
  it('records the run with a generated name at once and shows the name screen instead of the end screen', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(table()).toHaveLength(1)
    expect(table()[0]).toMatchObject({ score: 4200, stage: 3, mode: '1P' })
    expect(table()[0].name).toMatch(/^[A-Z]+-[0-9A-F]{2}$/)
    expect(isNameEntryOpen()).toBe(true)
    expect(renderGameOver).not.toHaveBeenCalled()
    // card keys are not taken while the name screen is open: letters type the name instead
    expect(handleCardKey('c')).toBe(false)
  })
  it('typed name + Enter renames the entry; the end screen then shows the table with the own entry', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    for (const k of ['z', 'o', 'e']) expect(handleNameKey(k)).toBe(true)
    expect(handleNameKey('Shift')).toBe(false)
    expect(handleNameKey('Enter')).toBe(true)
    frame(32)
    expect(isNameEntryOpen()).toBe(false)
    expect(table()[0].name).toBe('ZOE')
    frame(48)
    expect(renderGameOver).toHaveBeenCalled()
    const scores = vi.mocked(renderGameOver).mock.calls[vi.mocked(renderGameOver).mock.calls.length - 1][6] as { table: ScoreEntry[]; ownIds: string[] }
    expect(scores.table[0].name).toBe('ZOE')
    expect(scores.ownIds).toEqual([scores.table[0].id])
    expect(resetGameOverScreen).toHaveBeenCalledTimes(2) // entry, and again after the name screen
  })
  it('an untouched name screen accepts the default after 10 s; the run is recorded once', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    const name = table()[0].name
    for (let t = 32; t < IDLE_ACCEPT_MS + 100; t += 500) frame(t)
    expect(isNameEntryOpen()).toBe(false)
    expect(table()).toHaveLength(1)
    expect(table()[0].name).toBe(name)
  })
  it('victory records too', async () => {
    h.phase = 'victory'; h.stage = 6
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(table()[0]).toMatchObject({ stage: 6, mode: '1P' })
    expect(renderVictory).not.toHaveBeenCalled()
    handleNameKey('Enter'); frame(32); frame(48)
    expect(renderVictory).toHaveBeenCalled()
  })
  it('a zero score records nothing and shows the end screen directly', async () => {
    h.score = 0
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    expect(JSON.parse(store[STORAGE_KEY] ?? '[]')).toEqual([]) // at most the empty-table marker
    expect(isNameEntryOpen()).toBe(false)
    expect(renderGameOver).toHaveBeenCalled()
  })
  it('the title screen gets the stored table', async () => {
    h.phase = 'start'
    store[STORAGE_KEY] = JSON.stringify([{ id: 'a1', name: 'ANN', score: 99, stage: 2, date: '2025-10-31', mode: '2P' }])
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16)
    const opts = vi.mocked(renderStartScreen).mock.calls[0][4] as { table: ScoreEntry[] }
    expect(opts.table.map((e) => e.name)).toEqual(['ANN'])
  })
})
