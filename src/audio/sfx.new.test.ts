/** New sounds of playtest2-fixes (R4, R5): in the gain table, through the master bus, stack-safe. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeAudioContext, FakeNode } from '../test/fakeAudio'
import {
  SFX_IDS, SFX_GAIN, renderRecipe, measure, estimateMusicLevel, MUSIC_GAIN, recipeFor, recipeSeconds, stackPeakCeil, rawLevel,
} from './recipes'
import type { SfxId } from './recipes'

const NEW: readonly string[] = ['gameOver', 'uiConfirm', 'countTick', 'countGo']
const SR = 22050

describe('new SFX in the table', () => {
  it('every new id is an SFX with a gain entry and voices', () => {
    for (const id of NEW) {
      expect(SFX_IDS as readonly string[]).toContain(id)
      expect(SFX_GAIN[id as SfxId]).toBeGreaterThan(0)
      expect(recipeFor(id as SfxId).length).toBeGreaterThan(0)
    }
  })

  it('lengths: the sting is about 1.5-2.5 s; confirm, tick are short; go is under half a second', () => {
    expect(recipeSeconds(recipeFor('gameOver' as SfxId))).toBeGreaterThan(1.2)
    expect(recipeSeconds(recipeFor('gameOver' as SfxId))).toBeLessThan(2.6)
    expect(recipeSeconds(recipeFor('uiConfirm' as SfxId))).toBeLessThan(0.3)
    expect(recipeSeconds(recipeFor('countTick' as SfxId))).toBeLessThan(0.2)
    expect(recipeSeconds(recipeFor('countGo' as SfxId))).toBeLessThan(0.5)
  })

  it('confirm and tick are soft: their peaks sit at least 3 dB under the stack ceiling', () => {
    for (const id of ['uiConfirm', 'countTick'] as SfxId[]) {
      expect(rawLevel(id, SR).peak * SFX_GAIN[id]).toBeLessThanOrEqual(stackPeakCeil() * 0.708)
    }
  })

  it('stack: game over + confirm + tick (and go) at any 10 ms offset, plus the music peak, stay under 0 dBFS', () => {
    const music = estimateMusicLevel().peak * MUSIC_GAIN
    const buf = (id: SfxId) => renderRecipe(id, SR, SFX_GAIN[id])
    const [a, b, c, d] = (['gameOver', 'uiConfirm', 'countTick', 'countGo'] as SfxId[]).map(buf)
    let worst = 0
    for (let ob = 0; ob <= 300; ob += 10) for (let oc = 0; oc <= 300; oc += 10) {
      for (const third of [c, d]) {
        const sb = Math.round(ob / 1000 * SR), sc = Math.round(oc / 1000 * SR)
        const mix = new Float32Array(Math.max(a.length, sb + b.length, sc + third.length))
        a.forEach((x, i) => { mix[i] += x }); b.forEach((x, i) => { mix[sb + i] += x }); third.forEach((x, i) => { mix[sc + i] += x })
        worst = Math.max(worst, measure(mix).peak)
      }
    }
    expect(worst + music).toBeLessThan(1)
  }, 30_000)
})

describe('playback goes through the per-sound gain into the master bus', () => {
  let fake: FakeAudioContext
  beforeEach(() => {
    vi.resetModules()
    fake = new FakeAudioContext()
    vi.stubGlobal('AudioContext', class { constructor() { return fake as unknown as AudioContext } })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} })
    vi.stubGlobal('document', { hidden: false, addEventListener() {} })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it.each([['sfxGameOver', 'gameOver'], ['sfxConfirm', 'uiConfirm'], ['sfxCountTick', 'countTick'], ['sfxCountGo', 'countGo']])('%s', async (fn, id) => {
    const sfx = await import('./sfx') as unknown as Record<string, () => void>
    const { getMasterGain } = await import('./context')
    const master = getMasterGain() as unknown as FakeNode
    sfx[fn]()
    const outs = fake.nodes.filter((n) => n.connections.includes(master) && n.kind === 'gain')
    expect(outs).toHaveLength(1)
    expect(outs[0].gain.value).toBe(SFX_GAIN[id as SfxId])
    expect(fake.nodes.some((n) => n.connections.includes(fake.destination as unknown as FakeNode) && n !== master && outs.includes(n))).toBe(false)
  })
})
