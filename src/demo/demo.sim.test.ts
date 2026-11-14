/**
 * Headless full-run simulation of demo mode (demo-mode R7.4, T6): the real `startLoop`, the real
 * renderer, screens, motion buttons, hit detection, waves, boss phases and card session, driven by
 * the demo runtime on a fake clock. No canvas (recording proxy contexts), no audio (mocked), no camera.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  state: null as null | import('../game/state').GameState,
  skullHits: 0,
  cards: [] as Array<{ badge?: string; photo: boolean; score: number }>,
  drawn: [] as string[],
  playAgain: null as null | (() => void),
  onStart: null as null | ((mode: 1 | 2) => void),
}))

// The real renderer runs (drawing into a recording proxy), so the run consumes randomness exactly as in the browser.
vi.mock('../game/render', async (orig) => {
  const m = await orig<typeof import('../game/render')>()
  return {
    ...m,
    renderFrame: (c: CanvasRenderingContext2D, s: import('../game/state').GameState, ...rest: unknown[]) => {
      h.state = s
      return (m.renderFrame as (...a: unknown[]) => void)(c, s, ...rest)
    },
  }
})
vi.mock('../ui/screens', async (orig) => {
  const m = await orig<typeof import('../ui/screens')>()
  return {
    ...m,
    renderStartScreen: (...a: unknown[]) => {
      h.onStart = a[3] as (mode: 1 | 2) => void
      return (m.renderStartScreen as (...x: unknown[]) => void)(...a)
    },
    renderVictory: (...a: unknown[]) => {
      h.playAgain = a[3] as () => void
      return (m.renderVictory as (...x: unknown[]) => void)(...a)
    },
  }
})
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(),
  stopMusic: vi.fn(), setMusicCombo: vi.fn(), isMuted: () => false, toggleMute: vi.fn(), getAudioContext: vi.fn(),
}))
vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(), sfxCombo: vi.fn(),
  sfxSkullHit: () => { h.skullHits++ },
}))
vi.mock('../card/draw', () => ({
  composeCard: (data: { badge?: string; score: number }, photo: unknown) => {
    h.cards.push({ badge: data.badge, photo: photo !== null, score: data.score })
    return { width: 600, height: 840 }
  },
}))

import { startLoop, stopLoop, isCardPreviewOpen } from '../game/loop'
import { DemoRuntime } from './runtime'
import { DEMO } from './params'
import { getPlayerMode, setPlayerMode, resetPlayerMode } from '../game/playerMode'
import type { GamePhase } from '../game/state'

let W = 1280, H = 720
/** Demo ticks (60 per real second) a whole run may take: ~4 min of real time at the default speed (a clean run is ~2.5 min). */
const MAX_TICKS = 15_000

function canvas() {
  const base: Record<string, unknown> = { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }
  const c = {
    width: 4, height: 4,
    getContext: () => new Proxy(base, {
      get: (t, k: string) => (k === 'canvas' ? c : k in t ? t[k] : () => ({ addColorStop() {} })),
      set: () => true,
    }),
  }
  return c
}
function ctx(record = false): CanvasRenderingContext2D {
  const store: Record<string, unknown> = { canvas: { width: W, height: H } }
  return new Proxy(store, {
    get: (t, p: string) => {
      if (p in t) return t[p]
      if (record && p === 'fillText') return (text: string) => { h.drawn.push(text) }
      return () => ({ addColorStop() {} })
    },
    set: (t, p: string, v) => { t[p] = v; return true },
  }) as unknown as CanvasRenderingContext2D
}

let rafQueue: Array<(ts: number) => void> = []
const net = { fetch: vi.fn(), xhr: vi.fn(), beacon: vi.fn(), gum: vi.fn(), setItem: vi.fn() }

beforeEach(() => {
  rafQueue = []
  h.state = null; h.playAgain = null; h.onStart = null; h.skullHits = 0; h.cards = []; h.drawn = []
  Object.values(net).forEach((f) => f.mockClear())
  vi.stubGlobal('document', { createElement: () => canvas() })
  vi.stubGlobal('performance', { now: () => 0 })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return 1 })
  // A real browser drops the cancelled callback: a stopped loop must not keep ticking into the next simulated run.
  vi.stubGlobal('cancelAnimationFrame', () => { rafQueue = [] })
  vi.stubGlobal('localStorage', { getItem: () => '4242', setItem: net.setItem })
  vi.stubGlobal('fetch', net.fetch)
  vi.stubGlobal('XMLHttpRequest', function XHR() { net.xhr() })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: net.gum }, sendBeacon: net.beacon })
})
afterEach(() => { stopLoop(); vi.unstubAllGlobals() })

interface Run {
  ticks: number
  phases: Set<GamePhase>
  /** First tick of each milestone. */
  at: Partial<Record<'victory' | 'card' | 'titleAgain', number>>
  maxCombo: number
  bossPhases: Set<number>
  stages: Set<number>
  bonus: boolean
  skullSeen: boolean
  /** Phases of the ticks on which no DEMO badge was drawn. */
  missingBadge: GamePhase[]
  badgePhases: Set<string>
  gameOvers: number
  victoryScores: number[]
  highScoresShown: number[]
  /** Compact fingerprint of the run (hand path + score), for determinism checks. */
  trace: string
  /** Hand / score fingerprint of each run (from leaving the title to its return), sampled relative to the run's first tick. */
  runTraces: string[]
}

async function simulate(seed: number, victories = 1, maxTicks = MAX_TICKS * victories, stage = 1, speed: number = DEMO.timeScale): Promise<Run> {
  const rt = new DemoRuntime({ seed, stage, speed, w: W, h: H })
  await startLoop(null, ctx(), ctx(true), 1, { demo: rt })
  const run: Run = {
    ticks: 0, phases: new Set(), at: {}, maxCombo: 1, bossPhases: new Set(), stages: new Set(), bonus: false,
    skullSeen: false, missingBadge: [], badgePhases: new Set(), gameOvers: 0, victoryScores: [], highScoresShown: [], trace: '', runTraces: [],
  }
  let ts = 0
  let prev: GamePhase | null = null
  let won = 0
  const trace: number[] = []
  let runTrace: number[] = []
  let runI = 0
  try {
    for (let i = 0; i < maxTicks; i++) {
      ts += 1000 / 60
      h.drawn = []
      const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts))
      run.ticks++
      const s = h.state
      if (!s) continue
      const where = isCardPreviewOpen() ? 'card' : s.phase
      if (h.drawn.includes('DEMO')) run.badgePhases.add(where)
      else run.missingBadge.push(s.phase)
      run.phases.add(s.phase)
      run.maxCombo = Math.max(run.maxCombo, s.combo)
      if (s.phase !== 'start') run.stages.add(s.stage)
      if (s.bonus) run.bonus = true
      run.highScoresShown.push(s.highScore)
      for (const e of s.enemies) {
        if (e.type === 'boss') run.bossPhases.add(e.bossPhase)
        if (e.type === 'skull') run.skullSeen = true
      }
      if (s.phase === 'gameover' && prev !== 'gameover') run.gameOvers++
      if (s.phase === 'victory' && prev !== 'victory') { run.victoryScores.push(s.score); run.at.victory ??= i }
      if (isCardPreviewOpen()) run.at.card ??= i
      if (i % 30 === 0) trace.push(Math.round(rt.hand.x), Math.round(rt.hand.y), s.score)
      if (s.phase !== 'start') {
        if (prev === 'start' || prev === null) { runTrace = []; runI = 0 }
        if (runI++ % 30 === 0) runTrace.push(Math.round(rt.hand.x), Math.round(rt.hand.y), s.score)
      } else if (prev !== null && prev !== 'start') run.runTraces.push(runTrace.join(','))
      if (s.phase === 'start' && prev !== null && prev !== 'start') {
        won++
        run.at.titleAgain ??= i
        if (won >= victories) break
      }
      prev = s.phase
    }
  } finally {
    stopLoop()
    rt.dispose()
  }
  run.trace = trace.join(',')
  return run
}

describe('full demo run, headless (demo-mode R4, R5, R6)', () => {
  it(`default seed ${DEMO.defaultSeed}: title → 5 stages → victory → DEMO card → title, cleanly, within the bound`, async () => {
    const run = await simulate(DEMO.defaultSeed)
    // Script order and bound
    expect(run.at.victory).toBeDefined()
    expect(run.at.card).toBeDefined()
    expect(run.at.titleAgain).toBeDefined()
    expect(run.at.victory!).toBeLessThan(run.at.card!)
    expect(run.at.card!).toBeLessThan(run.at.titleAgain!)
    expect(run.ticks).toBeLessThan(MAX_TICKS)
    // Every stage, the bonus round and every boss phase are played; combo reaches x4; no game over
    expect(run.stages).toEqual(new Set([1, 2, 3, 4, 5]))
    expect(run.bonus).toBe(true)
    expect(run.bossPhases).toEqual(new Set([1, 2, 3]))
    expect(run.maxCombo).toBe(4)
    expect(run.gameOvers).toBe(0)
    expect(run.victoryScores[0]).toBeGreaterThan(0)
    // The skull appears but is never hit (R4.5)
    expect(run.skullSeen).toBe(true)
    expect(h.skullHits).toBe(0)
    // DEMO badge on every tick of every phase, including the card preview (R6.1)
    expect(run.missingBadge).toEqual([])
    for (const p of ['start', 'stageTitle', 'playing', 'summary', 'victory', 'card']) expect(run.badgePhases.has(p)).toBe(true)
    // The card carries the DEMO chip and the placeholder portrait (R6.3)
    expect(h.cards.length).toBeGreaterThan(0)
    for (const c of h.cards) { expect(c.badge).toBe('DEMO'); expect(c.photo).toBe(true) }
    // No camera, no network, nothing stored (R2.1, R2.3, R6.4)
    expect(net.gum).not.toHaveBeenCalled()
    expect(net.fetch).not.toHaveBeenCalled()
    expect(net.xhr).not.toHaveBeenCalled()
    expect(net.beacon).not.toHaveBeenCalled()
    expect(net.setItem).not.toHaveBeenCalled()
    // The stored best (4242) is never shown: demo starts from 0
    expect(run.highScoresShown[0]).toBe(0)
  }, 60_000)

  it('is deterministic: the same seed plays the identical run twice', async () => {
    const a = await simulate(DEMO.defaultSeed)
    const b = await simulate(DEMO.defaultSeed)
    expect(b.trace).toBe(a.trace)
    expect(b.victoryScores).toEqual(a.victoryScores)
    expect(b.at).toEqual(a.at)
  }, 60_000)

  it('attract loop: after the title returns, the next run is the same run again', async () => {
    const run = await simulate(DEMO.defaultSeed, 2)
    expect(run.victoryScores).toHaveLength(2)
    expect(run.victoryScores[1]).toBe(run.victoryScores[0])
    expect(run.runTraces).toHaveLength(2)
    expect(run.runTraces[1]).toBe(run.runTraces[0])
    expect(run.gameOvers).toBe(0)
  }, 120_000)

  // R1.1 allows speed 1–3: the clean run (R4.6, R4.5) and the identical loop (R4.8, R5.2) must hold at each.
  for (const speed of [1, 3]) {
    it(`speed ${speed}: a clean take, no skull hit, and the second loop replays the first`, async () => {
      const run = await simulate(DEMO.defaultSeed, 2, MAX_TICKS * 2 * (2 / speed), 1, speed)
      expect(run.victoryScores).toHaveLength(2)
      expect(run.gameOvers).toBe(0)
      expect(h.skullHits).toBe(0)
      expect(run.runTraces).toHaveLength(2)
      expect(run.runTraces[1]).toBe(run.runTraces[0])
      expect(run.victoryScores[1]).toBe(run.victoryScores[0])
    }, 240_000)
  }

  it('the attract mode leaves the remembered player mode alone (R7.1)', async () => {
    setPlayerMode(2)
    try {
      const run = await simulate(DEMO.defaultSeed, 1, 600, 5)
      expect(run.phases.has('playing')).toBe(true)
      expect(getPlayerMode()).toBe(2)
    } finally { resetPlayerMode() }
  }, 60_000)

  it('PLAY AGAIN on the victory screen starts the seeded demo stage, not an un-seeded stage 1 (R4.8)', async () => {
    const rt = new DemoRuntime({ seed: DEMO.defaultSeed, stage: 5, speed: DEMO.timeScale, w: W, h: H })
    await startLoop(null, ctx(), ctx(true), 1, { demo: rt })
    try {
      let ts = 0
      for (let i = 0; i < 4000 && !(h.state?.phase === 'victory' && h.playAgain); i++) {
        ts += 1000 / 60
        const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts))
      }
      expect(h.state?.phase).toBe('victory')
      const spy = vi.spyOn(rt, 'onRunStart')
      h.playAgain!()
      expect(spy).toHaveBeenCalledTimes(1)
      for (let i = 0; i < 5; i++) { ts += 1000 / 60; const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }
      expect(h.state?.phase).not.toBe('victory')
      expect(h.state?.stage).toBe(5)
    } finally { stopLoop(); rt.dispose() }
  }, 60_000)

  it('a 2 PLAYERS start request in demo mode plays one player and keeps the remembered mode (R7.1)', async () => {
    const rt = new DemoRuntime({ seed: DEMO.defaultSeed, stage: 1, speed: DEMO.timeScale, w: W, h: H })
    await startLoop(null, ctx(), ctx(true), 1, { demo: rt })
    try {
      let ts = 0
      const tick = () => { ts += 1000 / 60; const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }
      for (let i = 0; i < 5; i++) tick()
      expect(h.onStart).not.toBeNull()
      h.onStart!(2)
      for (let i = 0; i < 5; i++) tick()
      expect(h.state?.phase).not.toBe('start') // a one-player run began (stage title, then play)
      expect(getPlayerMode()).toBe(1)
    } finally { stopLoop(); rt.dispose() }
  }, 60_000)

  it('another seed plays a different run', async () => {
    const a = await simulate(DEMO.defaultSeed)
    const b = await simulate(DEMO.defaultSeed + 1)
    expect(b.trace).not.toBe(a.trace)
  }, 60_000)

  for (const [w, hh] of [[960, 540], [1366, 768], [1440, 900], [1920, 1080]]) {
    it(`default seed at ${w}×${hh}: a clean take too (victory, no game over, no skull hit)`, async () => {
      W = w; H = hh
      try {
        const run = await simulate(DEMO.defaultSeed)
        expect(run.at.card).toBeDefined()
        expect(run.gameOvers).toBe(0)
        expect(h.skullHits).toBe(0)
      } finally { W = 1280; H = 720 }
    }, 60_000)
  }

  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: reaches victory and the card preview within the bound and never hits the skull`, async () => {
      const run = await simulate(seed)
      expect(run.at.victory).toBeDefined()
      expect(run.at.card).toBeDefined()
      expect(run.at.titleAgain).toBeDefined()
      expect(run.ticks).toBeLessThan(MAX_TICKS)
      expect(h.skullHits).toBe(0)
      expect(run.maxCombo).toBe(4)
      expect(run.missingBadge).toEqual([])
      expect(net.gum).not.toHaveBeenCalled()
      expect(net.setItem).not.toHaveBeenCalled()
      // A run that loses a stage shows the game-over screen with the badge too, and RETRY carries on.
      if (run.gameOvers > 0) expect(run.badgePhases.has('gameover')).toBe(true)
    }, 60_000)
  }

  it('stage=5 starts at the boss: phases 1–3, victory, card', async () => {
    const run = await simulate(DEMO.defaultSeed, 1, MAX_TICKS, 5)
    expect(run.stages).toEqual(new Set([5]))
    expect(run.bossPhases).toEqual(new Set([1, 2, 3]))
    expect(run.at.card).toBeDefined()
    expect(run.ticks).toBeLessThan(3000)
  }, 60_000)

  it('some seed in 1–6 loses a stage, so the game-over screen and RETRY are covered', async () => {
    const run = await simulate(2)
    expect(run.gameOvers).toBeGreaterThan(0)
    expect(run.badgePhases.has('gameover')).toBe(true)
    expect(run.at.victory).toBeDefined()
  }, 60_000)
})
