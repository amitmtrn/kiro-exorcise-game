import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeAudioContext, FakeNode } from '../test/fakeAudio'
import { BUS_COMP, LIMITER, buildMasterBus } from './bus'

/** Fake context that also has dynamics compressors with plain `.value` params. */
class BusNode extends FakeNode {
  threshold = { value: 0 }
  knee = { value: 0 }
  ratio = { value: 0 }
  attack = { value: 0 }
  release = { value: 0 }
}
class BusContext extends FakeAudioContext {
  createDynamicsCompressor() { const n = new BusNode('compressor'); this.nodes.push(n); return n }
}

let fake: BusContext
const store = new Map<string, string>()

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  store.clear()
  fake = new BusContext()
  vi.stubGlobal('AudioContext', class { constructor() { return fake as unknown as AudioContext } })
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } })
  vi.stubGlobal('document', { hidden: false, addEventListener() {} })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

/** Nodes reachable from `from` without passing through `blocked`. */
function reach(from: FakeNode, blocked: FakeNode | null = null): Set<FakeNode> {
  const seen = new Set<FakeNode>()
  const stack = [from]
  while (stack.length) {
    const n = stack.pop()!
    if (seen.has(n) || n === blocked) continue
    seen.add(n)
    stack.push(...n.connections)
  }
  return seen
}

async function playEverything() {
  const sfx = await import('./sfx')
  const music = await import('./music')
  sfx.sfxGhostHit(); sfx.sfxBatHit(); sfx.sfxSkullHit(); sfx.sfxLifeLost()
  sfx.sfxCombo(2); sfx.sfxCombo(4); sfx.sfxStageClear(); sfx.sfxBossHit(); sfx.sfxBossDefeated()
  music.startMusic(1)
  music.startTitleMusic()
  music.startMusic(5)
  vi.advanceTimersByTime(200)
  return { sfx, music }
}

describe('master bus wiring (R5.1)', () => {
  it('builds master gain → compressor → limiter → destination with the documented settings', async () => {
    const { getMasterGain } = await import('./context')
    const master = getMasterGain() as unknown as FakeNode
    const comps = fake.nodes.filter((n) => n.kind === 'compressor') as BusNode[]
    expect(comps.length).toBe(2)
    const [comp, limiter] = comps
    expect(master.connections).toEqual([comp])
    expect(comp.connections).toEqual([limiter])
    expect(limiter.connections).toEqual([fake.destination])
    expect(comp).toMatchObject({ threshold: { value: BUS_COMP.threshold }, knee: { value: 12 }, ratio: { value: 3 }, attack: { value: 0.01 }, release: { value: 0.25 } })
    expect(limiter).toMatchObject({ threshold: { value: LIMITER.threshold }, knee: { value: 0 }, ratio: { value: 20 }, attack: { value: 0.001 }, release: { value: 0.1 } })
  })

  it('limiter is a faster, harder compressor than the bus compressor', () => {
    expect(LIMITER.ratio).toBeGreaterThan(BUS_COMP.ratio)
    expect(LIMITER.attack).toBeLessThan(BUS_COMP.attack)
    expect(LIMITER.threshold).toBeGreaterThan(BUS_COMP.threshold)
    expect(LIMITER.knee).toBe(0)
    expect(LIMITER.ratio).toBeLessThanOrEqual(20) // the AudioParam maximum
  })

  it('every SFX and music source reaches the destination only through the master gain', async () => {
    const { getMasterGain } = await import('./context')
    const master = getMasterGain() as unknown as FakeNode
    await playEverything()
    const sources = fake.nodes.filter((n) => n.kind === 'osc' || n.kind === 'noise')
    expect(sources.length).toBeGreaterThan(20)
    // 1. cut the master gain out: no source can still reach the destination
    for (const s of sources) expect(reach(s, master).has(fake.destination)).toBe(false)
    // 2. with it in place every source does reach the destination
    for (const s of sources) expect(reach(s).has(fake.destination)).toBe(true)
    // 3. only the limiter connects to the destination
    const direct = fake.nodes.filter((n) => n.connections.includes(fake.destination))
    expect(direct.map((n) => n.kind)).toEqual(['compressor'])
    expect(direct[0]).toBe(fake.nodes.filter((n) => n.kind === 'compressor')[1])
  })

  it('SFX go through a per-sound gain; music through the music gain, each connected to the master gain', async () => {
    const { getMasterGain } = await import('./context')
    const master = getMasterGain() as unknown as FakeNode
    await playEverything()
    const feeders = fake.nodes.filter((n) => n.connections.includes(master))
    // 9 SFX plays + the music bus
    expect(feeders.length).toBe(10)
    const gains = feeders.map((n) => n.gain.value).sort((a, b) => a - b)
    const { SFX_GAIN, MUSIC_GAIN } = await import('./recipes')
    expect(gains).toContain(MUSIC_GAIN)
    expect(gains).toContain(SFX_GAIN.bossHit)
    expect(gains).toContain(SFX_GAIN.ghostHit)
  })

  it('mute and volume act on the master gain; the bus stays in the graph (R5.2)', async () => {
    const ctxMod = await import('./context')
    const master = ctxMod.getMasterGain() as unknown as FakeNode
    ctxMod.setVolume(0.5)
    expect(master.gain.value).toBe(0.5)
    ctxMod.setMuted(true)
    expect(master.gain.value).toBe(0)
    expect(master.connections.length).toBe(1)
    ctxMod.setMuted(false)
    expect(master.gain.value).toBe(0.5)
  })
})

describe('fallback without compressors (R5.3)', () => {
  it('connects the master gain straight to the destination', () => {
    const plain = new FakeAudioContext()
    const bus = buildMasterBus(plain as unknown as AudioContext)
    expect(bus.comp).toBeNull()
    expect(bus.limiter).toBeNull()
    expect((bus.input as unknown as FakeNode).connections).toEqual([plain.destination])
  })
})
