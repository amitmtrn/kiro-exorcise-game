/** Loop audio cues (playtest2-fixes R4.1, R4.3, R5.1): the game-over sting once, the end-screen bed, countdown ticks. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ start: 'gameover' as 'gameover' | 'title' }))

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
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), sfxGameOver: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(), isMuted: () => false,
}))
vi.mock('../audio/sfx', () => ({ sfxCountTick: vi.fn(), sfxCountGo: vi.fn(), sfxConfirm: vi.fn() }))
vi.mock('./state', async (orig) => {
  const m = await orig<typeof import('./state')>()
  return {
    ...m,
    createInitialState: (...a: Parameters<typeof m.createInitialState>) => {
      const base = { ...m.createInitialState(...a), spawnTimers: { ghost: 1e9, bat: 1e9, skull: 1e9, lunger: 1e9, pumpkin: 1e9 } }
      if (h.start === 'title') return { ...base, phase: 'stageTitle' as const, stageTitleMs: m.STAGE_TITLE_DURATION_MS, stage: 2, waveIndex: 1e9 }
      // In play on the last heart with a ghost that has finished its telegraph on its target.
      return {
        ...base, phase: 'playing' as const, lives: 1, score: 10, stage: 3, roundTimeMs: 36_000,
        enemies: [m.makeEnemy({ id: 'a', type: 'ghost', x: 640, y: 360, targetX: 640, targetY: 360, speed: 0, hitbox: { x: 610, y: 330, w: 60, h: 60 }, warnMs: 1000 })],
      }
    },
  }
})
vi.mock('../card/snapshot', () => ({ grabMirroredSnapshot: () => null, releaseSnapshot: vi.fn() }))
vi.mock('../card/draw', () => ({ composeCard: () => ({ width: 600, height: 840 }) }))

import { startLoop, stopLoop, END_BED_DELAY_MS } from './loop'
import { sfxGameOver, stopMusic, startTitleMusic, startMusic } from '../audio/index'
import { sfxCountTick, sfxCountGo } from '../audio/sfx'
import { renderGameOver } from '../ui/screens'
import { DEATH_MS, STAGE_TITLE_DURATION_MS } from './state'

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

beforeEach(() => {
  rafQueue = []; clock = 0
  vi.clearAllMocks()
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', { now: () => clock })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals() })

describe('game over audio', () => {
  it('the sting plays exactly once at death, music stops, and the title bed returns on the GAME OVER screen', async () => {
    h.start = 'gameover'
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    frame(16) // the last heart goes
    expect(sfxGameOver).toHaveBeenCalledTimes(1)
    expect(stopMusic).toHaveBeenCalled()
    let shown = -1
    vi.mocked(renderGameOver).mockImplementation(() => { if (shown < 0) shown = clock })
    for (let t = 16; t < 16 + DEATH_MS + 4000; t += 33) frame(t + 33)
    expect(sfxGameOver).toHaveBeenCalledTimes(1) // never again on the end screens
    expect(shown).toBeGreaterThan(0)
    const firstBed = vi.mocked(startTitleMusic).mock.invocationCallOrder[0]
    expect(firstBed).toBeDefined()
    expect(vi.mocked(sfxGameOver).mock.invocationCallOrder[0]).toBeLessThan(firstBed)
  })
})

describe('countdown audio', () => {
  it('a stage 2 title card ticks 3, 2, 1 once each at 60 fps, then "go" once as play starts', async () => {
    h.start = 'title'
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    for (let t = 0; t < STAGE_TITLE_DURATION_MS + 1000; t += 16) frame(t + 16)
    expect(sfxCountTick).toHaveBeenCalledTimes(3)
    expect(sfxCountGo).toHaveBeenCalledTimes(1)
    expect(startMusic).toHaveBeenCalledWith(2)
    expect(vi.mocked(sfxCountGo).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(sfxCountTick).mock.invocationCallOrder[2])
  })

  it('at 30 fps with a stalled 100 ms frame, still once per number', async () => {
    h.start = 'title'
    await startLoop({} as HTMLVideoElement, ctx(), ctx())
    let t = 0
    for (; t < 1500; t += 33) frame(t + 33)
    frame(t + 100); t += 100
    for (; t < STAGE_TITLE_DURATION_MS + 1000; t += 33) frame(t + 33)
    expect(sfxCountTick).toHaveBeenCalledTimes(3)
    expect(sfxCountGo).toHaveBeenCalledTimes(1)
  })
})

it('END_BED_DELAY_MS leaves room for the sting after the death transition', () => {
  expect(DEATH_MS + END_BED_DELAY_MS).toBeGreaterThanOrEqual(1600)
})
