/** Death transition and the order of screens in the loop (playtest1-fixes R1.5, R1.6). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  // The game starts in play, on its last heart, with three ghosts about to arrive and a score that makes the table.
  return {
    ...m,
    createInitialState: (...a: Parameters<typeof m.createInitialState>) => ({
      ...m.createInitialState(...a), phase: 'playing' as const, lives: 1, score: 30050, stage: 3, roundTimeMs: 36_000,
      spawnTimers: { ghost: 1e9, bat: 1e9, skull: 1e9, lunger: 1e9, pumpkin: 1e9 },
      enemies: ['a', 'b', 'c'].map((id) => m.makeEnemy({ id, type: 'ghost', x: 640, y: 360, targetX: 640, targetY: 360, speed: 0, hitbox: { x: 610, y: 330, w: 60, h: 60 } })),
    }),
  }
})
vi.mock('../card/snapshot', () => ({ grabMirroredSnapshot: () => null, releaseSnapshot: vi.fn() }))
vi.mock('../card/draw', () => ({ composeCard: () => ({ width: 600, height: 840 }) }))

import { startLoop, stopLoop, isNameEntryOpen } from './loop'
import { renderGameOver } from '../ui/screens'
import { renderHUD } from '../ui/hud'
import { DEATH_MS, NAME_DELAY_MS } from './state'

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
const store: Record<string, string> = {}

beforeEach(() => {
  rafQueue = []; clock = 0
  vi.mocked(renderGameOver).mockClear(); vi.mocked(renderHUD).mockClear()
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', { now: () => clock })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = v } })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals() })

describe('instant game over (playtest 1, 2:55)', () => {
  it('three arrivals on the last heart: freeze first, then GAME OVER, then the name screen, never straight from play', async () => {
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16) // play frame: the three ghosts reach the target, the last heart is lost
    expect(renderHUD).toHaveBeenCalled()
    let t = 16
    // death transition: HUD stays up, no GAME OVER, no name screen
    vi.mocked(renderHUD).mockClear()
    for (; t < 16 + DEATH_MS - 100; t += 50) { frame(t + 50); expect(isNameEntryOpen()).toBe(false) }
    expect(renderGameOver).not.toHaveBeenCalled()
    expect(renderHUD).toHaveBeenCalled()
    // GAME OVER appears, still no name screen
    let shown = -1
    vi.mocked(renderGameOver).mockImplementation(() => { if (shown < 0) shown = clock })
    for (; shown < 0; t += 50) frame(t + 50)
    expect(shown).toBeGreaterThanOrEqual(16 + DEATH_MS)
    expect(isNameEntryOpen()).toBe(false)
    // the name screen opens NAME_DELAY_MS after GAME OVER appeared
    for (; clock < shown + NAME_DELAY_MS - 150; ) { frame(clock + 50); expect(isNameEntryOpen()).toBe(false) }
    for (let i = 0; i < 6; i++) frame(clock + 50)
    expect(isNameEntryOpen()).toBe(true)
  })
})
