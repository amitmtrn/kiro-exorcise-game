import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeAudioContext, FakeNode } from '../test/fakeAudio'

let fake: FakeAudioContext

beforeEach(() => {
  vi.resetModules()
  fake = new FakeAudioContext()
  vi.stubGlobal('AudioContext', class { constructor() { return fake as unknown as AudioContext } })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} })
  vi.stubGlobal('document', { hidden: false, addEventListener() {} })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('per-sound gain cleanup', () => {
  it('disconnects the per-sound gain once its last voice has ended', async () => {
    const sfx = await import('./sfx')
    const { getMasterGain } = await import('./context')
    const master = getMasterGain() as unknown as FakeNode
    sfx.sfxBossDefeated()
    const outs = fake.nodes.filter((n) => n.connections.includes(master) && n.kind === 'gain')
    expect(outs).toHaveLength(1)
    expect(outs[0].disconnected).toBe(false)
    const sources = fake.nodes.filter((n) => (n.kind === 'osc' || n.kind === 'noise') && n.startedAt !== null) as Array<FakeNode & { onended?: () => void }>
    const last = sources.reduce((a, b) => ((b.stoppedAt ?? 0) >= (a.stoppedAt ?? 0) ? b : a))
    expect(last.onended).toBeTypeOf('function')
    last.onended!()
    expect(outs[0].disconnected).toBe(true)
  })
})
