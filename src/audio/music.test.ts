import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeAudioContext, FakeNode } from '../test/fakeAudio'

let ctx: FakeAudioContext
let master: FakeNode
const getAudioContext = vi.fn(() => ctx as unknown as AudioContext)
const getMasterGain = vi.fn(() => master as unknown as GainNode)

vi.mock('./context', () => ({
  getAudioContext: () => getAudioContext(),
  getMasterGain: () => getMasterGain(),
}))

const music = await import('./music')

beforeEach(() => {
  vi.useFakeTimers()
  ctx = new FakeAudioContext()
  master = new FakeNode('master')
  getAudioContext.mockClear()
  getMasterGain.mockClear()
  music.resetMusicForTests()
})
afterEach(() => {
  music.stopMusic()
  ctx.currentTime += 1
  vi.advanceTimersByTime(100)
  vi.useRealTimers()
})

/** Smallest gap between hat hits: 1, 2 or 4 steps depending on the hat pattern. */
function stepSpacing(): number {
  const times = ctx.started('noise').map(n => n.startedAt!).sort((a, b) => a - b)
  return Math.min(...times.slice(1).map((t, i) => t - times[i]).filter(d => d > 1e-6))
}

describe('music public API', () => {
  it('does not touch the AudioContext on import, stop, or combo changes', () => {
    music.stopMusic()
    music.setMusicCombo(3)
    expect(getAudioContext).not.toHaveBeenCalled()
  })

  it('startTitleMusic is idempotent and cheap once playing', () => {
    music.startTitleMusic()
    const calls = getAudioContext.mock.calls.length
    const nodes = ctx.nodes.length
    for (let i = 0; i < 100; i++) music.startTitleMusic()
    expect(getAudioContext.mock.calls.length).toBe(calls)
    expect(ctx.nodes.length).toBe(nodes)
  })

  it('stage 1–4 and boss map to different tempos (stage 5 = boss track)', () => {
    const spacing = (stage: number) => {
      music.resetMusicForTests()
      ctx = new FakeAudioContext()
      music.startMusic(stage)
      for (let i = 0; i < 120; i++) { ctx.currentTime += 0.025; vi.advanceTimersByTime(25) }
      const s = stepSpacing()
      music.stopMusic()
      return s
    }
    expect(spacing(5)).toBeCloseTo(60 / 132 / 4, 6)
    expect(spacing(2)).toBeCloseTo(2 * 60 / 104 / 4, 6)
    expect(spacing(1)).toBeCloseTo(4 * 60 / 80 / 4, 6)
  })

  it('music reaches the master gain, so mute and volume apply', () => {
    music.startMusic(1)
    expect(getMasterGain).toHaveBeenCalled()
    const buses = ctx.nodes.filter(n => n.kind === 'gain' && n.connections[0] === master)
    expect(buses).toHaveLength(1)
  })

  it('combo set before the engine exists applies when it starts', () => {
    music.setMusicCombo(4)
    music.startMusic(1)
    for (let i = 0; i < 80; i++) { ctx.currentTime += 0.025; vi.advanceTimersByTime(25) }
    expect(ctx.started('osc').some(o => o.type === 'square')).toBe(true)   // lead is audible at x3+
  })

  it('stopMusic fades out and a later startTitleMusic plays again', () => {
    music.startTitleMusic()
    music.stopMusic()
    const nodes = ctx.nodes.length
    music.startTitleMusic()
    expect(ctx.nodes.length).toBeGreaterThan(nodes)
  })
})

describe('visibility pause', () => {
  it('setMusicPaused pauses and resumes the engine timer', () => {
    music.startTitleMusic()
    music.setMusicPaused(true)
    expect(vi.getTimerCount()).toBe(0)
    music.setMusicPaused(false)
    expect(vi.getTimerCount()).toBe(1)
  })
})

describe('visibilitychange wiring', () => {
  it('pauses on hidden and resumes on visible', async () => {
    const handlers: Array<() => void> = []
    const doc = { hidden: false, addEventListener: (_: string, f: () => void) => handlers.push(f) }
    vi.stubGlobal('document', doc)
    vi.resetModules()
    const m = await import('./music')
    m.startTitleMusic()
    expect(handlers.length).toBe(1)
    doc.hidden = true; handlers[0]()
    expect(vi.getTimerCount()).toBe(0)
    doc.hidden = false; handlers[0]()
    expect(vi.getTimerCount()).toBe(1)
    m.stopMusic()
    vi.unstubAllGlobals()
  })
})
