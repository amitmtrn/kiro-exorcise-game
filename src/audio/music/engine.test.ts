import { getNoiseBuffer } from './voices'
import { describe, it, expect, vi } from 'vitest'
import { createMusicEngine, crossfade, CROSSFADE_SEC, LAYER_FADE_SEC } from './engine'
import { FakeAudioContext, FakeNode, FakeParam, fakeTimers } from '../../test/fakeAudio'
import { getTrack, parseTrack, type TrackId } from './patterns'

function setup() {
  const ctx = new FakeAudioContext()
  const master = new FakeNode('master')
  const timers = fakeTimers()
  const engine = createMusicEngine({
    ctx: ctx as unknown as AudioContext,
    destination: master as unknown as AudioNode,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  })
  /** Advance the audio clock in 25 ms steps, firing the timer each time. */
  const advance = (sec: number) => {
    const end = ctx.currentTime + sec
    while (ctx.currentTime < end - 1e-9) { ctx.currentTime += 0.025; timers.fire() }
  }
  return { ctx, master, timers, engine, advance }
}

describe('crossfade()', () => {
  it('ramps out→0 and in→1 over the same window', () => {
    const out = new FakeParam(0.7), inn = new FakeParam(0)
    crossfade(out as unknown as AudioParam, inn as unknown as AudioParam, 10, 0.5)
    expect(out.calls).toEqual([
      { kind: 'cancel', time: 10 },
      { kind: 'set', value: 0.7, time: 10 },
      { kind: 'linear', value: 0, time: 10.5 },
    ])
    expect(inn.calls).toEqual([
      { kind: 'cancel', time: 10 },
      { kind: 'set', value: 0, time: 10 },
      { kind: 'linear', value: 1, time: 10.5 },
    ])
  })
})

describe('engine playback', () => {
  it('routes the bus into the destination (the fade gain is in the signal path)', () => {
    const { engine, ctx, master } = setup()
    engine.play('stage1')
    const buses = ctx.nodes.filter(n => n.kind === 'gain' && n.connections[0] === master)
    expect(buses).toHaveLength(1)
    // every started voice reaches the bus through a layer gain
    const bus = buses[0]
    const layerGains = ctx.nodes.filter(n => n.kind === 'gain' && n.connections[0] === bus)
    expect(layerGains).toHaveLength(6)
  })

  it('does nothing and starts no timer before play(); same track twice is a no-op', () => {
    const { engine, timers, ctx, advance } = setup()
    expect(timers.count()).toBe(0)
    engine.play('stage2')
    const n = ctx.nodes.length
    engine.play('stage2')
    expect(ctx.nodes.length).toBe(n)
    expect(engine.currentTrack()).toBe('stage2')
    advance(1)
    expect(timers.count()).toBe(1)
  })

  it('schedules notes at exact step times (start + n*stepDuration), each once', () => {
    const { engine, ctx, advance } = setup()
    engine.play('stage2')            // combo 1: bass + hat only
    advance(8)
    const def = getTrack('stage2')
    const sd = 60 / def.bpm / 4
    const hats = ctx.started('noise').map(n => n.startedAt!)
    const unique = new Set(hats)
    expect(unique.size).toBe(hats.length)
    for (const t of hats) {
      const n = Math.round((t - 0.05) / sd)
      expect(t).toBeCloseTo(0.05 + n * sd, 9)
    }
    // hat events per loop in the data × loops that fit the window
    const parsed = parseTrack(def)
    const perLoop = parsed.stepEvents.filter(e => e.hat !== undefined).length
    const stepsDone = Math.floor((8 + 0.1 - 0.05) / sd) + 1   // steps with time < 8.1
    const loops = Math.floor(stepsDone / parsed.steps)
    expect(hats.length).toBeGreaterThanOrEqual(perLoop * loops)
    expect(hats.length).toBeLessThanOrEqual(perLoop * (loops + 1))
  })

  it('never schedules a note further than 100 ms ahead of the clock', () => {
    const { engine, ctx } = setup()
    engine.play('stage4')
    let seen = 0
    for (let i = 0; i < 200; i++) {
      ctx.currentTime += 0.025
      engine.tick()
      const all = [...ctx.started('osc'), ...ctx.started('noise')]
      for (const n of all.slice(seen)) expect(n.startedAt!).toBeLessThan(ctx.currentTime + 0.1)
      seen = all.length
    }
    expect(seen).toBeGreaterThan(0)
  })
})

describe('layers per combo tier (R3.1)', () => {
  /** Count voices started in a window, by waveform / source. */
  function audible(tier: number, track: TrackId = 'stage2') {
    const { engine, ctx, advance } = setup()
    engine.setCombo(tier)
    engine.play(track)
    advance(6)
    const oscs = ctx.started('osc')
    return {
      saw: oscs.filter(o => o.type === 'sawtooth').length,           // bass
      sine: oscs.filter(o => o.type === 'sine').length,              // kick
      tri190: oscs.filter(o => o.type === 'triangle' && o.frequency.calls[0]?.value === 190).length, // snare body
      square: oscs.filter(o => o.type === 'square').length,          // lead
      noise: ctx.started('noise').length,
      hp: ctx.nodes.filter(n => n.kind === 'filter' && n.type === 'highpass' && n.connections.length).length,
    }
  }

  it('x1 plays bass + hat only', () => {
    const a = audible(1)
    expect(a.saw).toBeGreaterThan(0)
    expect(a.hp).toBeGreaterThan(0)
    expect(a.sine).toBe(0)
    expect(a.tri190).toBe(0)
    expect(a.square).toBe(0)
  })
  it('x2 adds kick and snare', () => {
    const a = audible(2)
    expect(a.sine).toBeGreaterThan(0)
    expect(a.tri190).toBeGreaterThan(0)
    expect(a.square).toBe(0)
  })
  it('x3 adds lead', () => {
    expect(audible(3).square).toBeGreaterThan(0)
  })
  it('x4 adds the arpeggio (more triangle voices than x3)', () => {
    const tri = (tier: number) => {
      const { engine, ctx, advance } = setup()
      engine.setCombo(tier); engine.play('stage2'); advance(6)
      return ctx.started('osc').filter(o => o.type === 'triangle' && o.frequency.calls[0]?.value !== 190).length
    }
    expect(tri(4)).toBeGreaterThan(tri(3))
  })

  it('title ignores combo (always tier 3); boss has a floor of 2', () => {
    const { engine } = setup()
    engine.setCombo(1)
    engine.play('title')
    expect(engine.currentTier()).toBe(3)
    engine.setCombo(4)
    expect(engine.currentTier()).toBe(3)
    engine.play('boss')
    engine.setCombo(1)
    expect(engine.currentTier()).toBe(2)
  })

  it('a new track starts at the remembered combo tier (R3.5)', () => {
    const { engine } = setup()
    engine.setCombo(3)
    engine.play('stage3')
    expect(engine.currentTier()).toBe(3)
  })

  it('tier change ramps each layer gain over 150 ms', () => {
    const { engine, ctx, advance } = setup()
    engine.play('stage1')
    advance(1)
    const t0 = ctx.currentTime
    engine.setCombo(4)
    const ramped = ctx.nodes.filter(n => n.kind === 'gain' && n.gain.calls.some(c => c.kind === 'linear' && c.time === t0 + LAYER_FADE_SEC))
    // kick, snare, lead, arp ramp up to 1; bass and hat ramp 1 → 1
    expect(ramped).toHaveLength(6)
    const ups = ramped.filter(n => n.gain.calls.some(c => c.kind === 'set' && c.value === 0 && c.time === t0))
    expect(ups).toHaveLength(4)
    for (const n of ups) {
      const last = n.gain.calls[n.gain.calls.length - 1]
      expect(last).toEqual({ kind: 'linear', value: 1, time: t0 + LAYER_FADE_SEC })
    }
    engine.setCombo(1)
    const downs = ctx.nodes.filter(n => n.kind === 'gain' && n.gain.calls.some(c => c.kind === 'linear' && c.value === 0 && c.time === t0 + LAYER_FADE_SEC))
    expect(downs).toHaveLength(4)
  })

  it('setCombo with an unchanged tier schedules nothing', () => {
    const { engine, ctx } = setup()
    engine.play('stage1')
    engine.setCombo(2); engine.setCombo(2.4)
    const calls = ctx.nodes.reduce((s, n) => s + n.gain.calls.length, 0)
    engine.setCombo(2)
    expect(ctx.nodes.reduce((s, n) => s + n.gain.calls.length, 0)).toBe(calls)
  })
})

describe('track crossfade and stop (R5)', () => {
  function buses(ctx: FakeAudioContext, master: FakeNode) {
    return ctx.nodes.filter(n => n.kind === 'gain' && n.connections[0] === master)
  }

  it('first track fades in 0 → 1 over 0.5 s', () => {
    const { engine, ctx, master } = setup()
    ctx.currentTime = 3
    engine.play('title')
    const [bus] = buses(ctx, master)
    expect(bus.gain.calls).toEqual([
      { kind: 'set', value: 0, time: 3 },
      { kind: 'cancel', time: 3 },
      { kind: 'set', value: 0, time: 3 },
      { kind: 'linear', value: 1, time: 3 + CROSSFADE_SEC },
    ])
  })

  it('switching tracks ramps old bus → 0 and new bus → 1, same start, 0.5 s', () => {
    const { engine, ctx, master, advance } = setup()
    engine.play('stage1')
    advance(2)
    const t = ctx.currentTime
    buses(ctx, master)[0].gain.value = 0.6   // level the fade must start from
    engine.play('stage2')
    const [oldBus, newBus] = buses(ctx, master)
    expect(oldBus.gain.calls.slice(-2)[0].value).toBe(0.6)
    expect(oldBus.gain.calls.slice(-3)).toEqual([
      { kind: 'cancel', time: t },
      { kind: 'set', value: 0.6, time: t },
      { kind: 'linear', value: 0, time: t + 0.5 },
    ])
    expect(newBus.gain.calls.slice(-2)).toEqual([
      { kind: 'set', value: 0, time: t },
      { kind: 'linear', value: 1, time: t + 0.5 },
    ])
    expect(engine.currentTrack()).toBe('stage2')
  })

  it('the outgoing track schedules no new notes after the fade starts', () => {
    const { engine, ctx, master, advance } = setup()
    engine.play('stage1')
    advance(2)
    engine.play('stage2')
    const [oldBus] = buses(ctx, master)
    const feeds = (n: FakeNode) => {
      // walk connections to see whether it ends in oldBus
      const seen = new Set<FakeNode>(); const stack = [n]
      while (stack.length) { const c = stack.pop()!; if (c === oldBus) return true; for (const x of c.connections) if (!seen.has(x)) { seen.add(x); stack.push(x) } }
      return false
    }
    const before = ctx.nodes.filter(n => n.startedAt !== null && feeds(n)).length
    advance(2)
    expect(ctx.nodes.filter(n => n.startedAt !== null && feeds(n)).length).toBe(before)
  })

  it('disconnects the old bus once the fade is over, and stops the timer when idle', () => {
    const { engine, ctx, master, advance, timers } = setup()
    engine.play('stage1')
    advance(1)
    engine.stop()
    const [bus] = buses(ctx, master)
    const t = ctx.currentTime
    expect(bus.gain.calls[bus.gain.calls.length - 1]).toEqual({ kind: 'linear', value: 0, time: t + 0.5 })
    advance(0.4)
    expect(bus.disconnected).toBe(false)
    expect(timers.count()).toBe(1)
    advance(0.2)
    expect(bus.disconnected).toBe(true)
    expect(timers.count()).toBe(0)
    expect(engine.currentTrack()).toBeNull()
  })

  it('can play again after stop()', () => {
    const { engine, advance } = setup()
    engine.play('stage1'); advance(1); engine.stop(); advance(1)
    engine.play('stage1')
    expect(engine.currentTrack()).toBe('stage1')
  })

  it('stop() with nothing playing is harmless', () => {
    const { engine } = setup()
    expect(() => engine.stop()).not.toThrow()
  })

  it('resumes a suspended context from the timer', () => {
    const { engine, ctx, advance } = setup()
    ctx.state = 'suspended'
    engine.play('title')
    advance(0.1)
    expect(ctx.resumeCalls).toBeGreaterThan(0)
  })

  it('rejects an unknown track id', () => {
    const { engine } = setup()
    expect(() => engine.play('nope' as TrackId)).toThrow()
  })
})

describe('review fixes', () => {
  it('uses cancelAndHoldAtTime when the browser has it', () => {
    const calls: number[] = []
    const out = Object.assign(new FakeParam(0.5), { cancelAndHoldAtTime: (t: number) => { calls.push(t) } })
    crossfade(out as unknown as AudioParam, null, 4, 0.5)
    expect(calls).toEqual([4])
    // an explicit anchor at `now` precedes the ramp
    expect(out.calls).toEqual([
      { kind: 'set', value: 0.5, time: 4 },
      { kind: 'linear', value: 0, time: 4.5 },
    ])
  })

  it('anchors the ramp at now on the fallback path too', () => {
    const out = new FakeParam(0.5)
    crossfade(out as unknown as AudioParam, null, 4, 0.5)
    const i = out.calls.findIndex(c => c.kind === 'linear')
    expect(out.calls[i - 1]).toEqual({ kind: 'set', value: 0.5, time: 4 })
  })

  it('play() while paused does not schedule a window', () => {
    const { engine, ctx } = setup()
    engine.setPaused(true)
    engine.play('title')
    expect(ctx.started('osc')).toEqual([])
  })

  it('retries resume() if one stays pending', () => {
    const { engine, ctx } = setup()
    ctx.state = 'suspended'
    ctx.resume = () => { ctx.resumeCalls++; return new Promise<void>(() => {}) }
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    engine.play('title'); engine.tick()
    expect(ctx.resumeCalls).toBe(1)
    now.mockReturnValue(2500)
    engine.tick()
    expect(ctx.resumeCalls).toBe(2)
    now.mockRestore()
  })

  it('calls ctx.resume() once while a resume is in flight', async () => {
    const { engine, ctx } = setup()
    let release!: () => void
    ctx.state = 'suspended'
    ctx.resume = () => { ctx.resumeCalls++; return new Promise<void>(r => { release = r }) }
    engine.play('title')
    engine.tick(); engine.tick()
    expect(ctx.resumeCalls).toBe(1)
    release(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    engine.tick()
    expect(ctx.resumeCalls).toBe(2)
  })

  it('setPaused stops the timer and resumes it', () => {
    const { engine, timers } = setup()
    engine.play('title')
    expect(timers.count()).toBe(1)
    engine.setPaused(true)
    expect(timers.count()).toBe(0)
    engine.setPaused(false)
    expect(timers.count()).toBe(1)
  })

  it('does not use setTimeout for timing', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const { engine, advance } = setup()
    engine.play('title')
    advance(1)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('noise buffer is fixed-seed and shared per context (R2.2)', () => {
    const a = new FakeAudioContext(), b = new FakeAudioContext()
    const first = getNoiseBuffer(a as unknown as AudioContext)
    expect(getNoiseBuffer(a as unknown as AudioContext)).toBe(first)
    expect(getNoiseBuffer(b as unknown as AudioContext)).not.toBe(first)
    const d1 = (first as unknown as { getChannelData(n: number): Float32Array }).getChannelData(0)
    expect(d1.length).toBe(4000)
  })
})

describe('suspended context (webcam-only player, no gesture yet)', () => {
  function suspended() {
    const s = setup()
    s.ctx.state = 'suspended'
    s.ctx.resume = () => { s.ctx.resumeCalls++; return new Promise<void>(() => { /* never: no gesture */ }) }
    s.ctx.deferredParams = true
    return s
  }
  const buses = (ctx: FakeAudioContext, master: FakeNode) =>
    ctx.nodes.filter(n => n.kind === 'gain' && n.connections.includes(master))

  it('a track replaced before it was audible is disconnected, not faded from 1 (R5.2/R5.3)', () => {
    const { ctx, master, engine } = suspended()
    engine.play('title')
    engine.play('stage1')
    engine.play('stage2')
    const [t, s1, s2] = buses(ctx, master)
    expect(t.gain.value).toBe(1)                       // stale default, as in a browser
    expect(t.disconnected).toBe(true)
    expect(s1.disconnected).toBe(true)
    expect(s2.disconnected).toBe(false)
    expect(t.gain.calls.some(c => c.kind === 'linear' && c.value === 0)).toBe(false)
  })

  it('nothing queues for retirement while time is frozen', () => {
    const { ctx, master, engine, advance } = suspended()
    engine.play('title'); engine.play('stage1'); engine.stop()
    advance(1)
    expect(buses(ctx, master).every(b => b.disconnected)).toBe(true)
  })

  it('a tier change sets layer gains outright instead of anchoring at the stale value', () => {
    const { ctx, engine } = suspended()
    engine.play('stage1')
    const before = ctx.nodes.length
    engine.setCombo(4)
    expect(before).toBe(ctx.nodes.length)
    const layer = ctx.nodes.filter(n => n.kind === 'gain').slice(1, 7)
    for (const g of layer) expect(g.gain.calls.some(c => c.kind === 'linear')).toBe(false)
    expect(layer.every(g => g.gain.calls[g.gain.calls.length - 1]?.kind === 'set')).toBe(true)
  })

  it('dispose() clears the timer and disconnects every bus', () => {
    const { ctx, master, timers, engine } = setup()
    engine.play('stage1'); engine.play('stage2')
    engine.dispose()
    expect(timers.count()).toBe(0)
    expect(buses(ctx, master).every(b => b.disconnected)).toBe(true)
    expect(engine.currentTrack()).toBeNull()
  })
})
