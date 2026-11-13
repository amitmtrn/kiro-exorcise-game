/**
 * Music engine: owns the track buses, layer gains, the 25 ms timer, and the
 * crossfade. Signal path per track:
 *   voice nodes → layer gain → track bus gain → destination (master gain)
 */

import { StepScheduler, TICK_MS } from './scheduler'
import { LAYERS, effectiveTier, layersForTier, type Layer } from './layers'
import { TRACKS, parseTrack, type ParsedTrack, type TrackDef, type TrackId } from './patterns'
import { playArp, playBass, playHat, playKick, playLead, playSnare } from './voices'

export const CROSSFADE_SEC = 0.5
export const LAYER_FADE_SEC = 0.15
const START_DELAY_SEC = 0.05
/** A resume() still pending after this long is retried (needs a gesture). */
const RESUME_RETRY_MS = 1000

export interface EngineDeps {
  ctx: AudioContext
  destination: AudioNode
  tracks?: TrackDef[]
  setIntervalFn?: (fn: () => void, ms: number) => unknown
  clearIntervalFn?: (id: unknown) => void
}

interface Playback {
  def: TrackDef
  parsed: ParsedTrack
  bus: GainNode
  layerGains: Record<Layer, GainNode>
  scheduler: StepScheduler
  tier: number
  retireAt: number
}

/**
 * Freeze an AudioParam at its current level from `now` and leave an explicit
 * anchor event at `now`, so the next ramp starts here (not at an older event).
 */
function hold(p: AudioParam, now: number): void {
  const h = (p as AudioParam & { cancelAndHoldAtTime?: (t: number) => unknown }).cancelAndHoldAtTime
  if (typeof h === 'function') {
    h.call(p, now)
    p.setValueAtTime(p.value, now)
    return
  }
  const from = p.value
  p.cancelScheduledValues(now)
  p.setValueAtTime(from, now)
}

/** Ramp `out` to 0 and `in` up to 1 over `dur`, both starting at `now`. */
export function crossfade(out: AudioParam | null, inn: AudioParam | null, now: number, dur: number): void {
  if (out) {
    hold(out, now)
    out.linearRampToValueAtTime(0, now + dur)
  }
  if (inn) {
    inn.cancelScheduledValues(now)
    inn.setValueAtTime(0, now)
    inn.linearRampToValueAtTime(1, now + dur)
  }
}

export function createMusicEngine(deps: EngineDeps) {
  const { ctx, destination } = deps
  const defs = deps.tracks ?? TRACKS
  const setI = deps.setIntervalFn ?? ((fn: () => void, ms: number) => setInterval(fn, ms))
  const clearI = deps.clearIntervalFn ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>))
  const parsedCache = new Map<TrackId, ParsedTrack>()

  let current: Playback | null = null
  let retiring: Playback[] = []
  let combo = 1
  let timer: unknown = null
  let resuming = false
  let resumeStartedAt = 0
  let paused = false

  function parsed(def: TrackDef): ParsedTrack {
    let p = parsedCache.get(def.id)
    if (!p) { p = parseTrack(def); parsedCache.set(def.id, p) }
    return p
  }

  function onStep(pb: Playback, step: number, time: number): void {
    const ev = pb.parsed.stepEvents[step]
    const on = layersForTier(pb.tier)
    const sd = pb.scheduler.stepDuration
    const tr = pb.def.transpose
    if (on.bass && ev.bass) playBass(ctx, pb.layerGains.bass, time, ev.bass.midi + tr, ev.bass.lenSteps * sd)
    if (on.kick && ev.kick !== undefined) playKick(ctx, pb.layerGains.kick, time, ev.kick)
    if (on.snare && ev.snare !== undefined) playSnare(ctx, pb.layerGains.snare, time, ev.snare)
    if (on.hat && ev.hat !== undefined) playHat(ctx, pb.layerGains.hat, time, ev.hat)
    if (on.lead && ev.lead) playLead(ctx, pb.layerGains.lead, time, ev.lead.midi + tr, ev.lead.lenSteps * sd)
    if (on.arp && ev.arp) playArp(ctx, pb.layerGains.arp, time, ev.arp.midi + tr)
  }

  function build(def: TrackDef, now: number): Playback {
    const p = parsed(def)
    const bus = ctx.createGain()
    bus.gain.setValueAtTime(0, now)
    bus.connect(destination)
    const tier = effectiveTier(def, combo)
    const active = layersForTier(tier)
    const layerGains = {} as Record<Layer, GainNode>
    for (const l of LAYERS) {
      const g = ctx.createGain()
      g.gain.setValueAtTime(active[l] ? 1 : 0, now)
      g.connect(bus)
      layerGains[l] = g
    }
    const pb: Playback = {
      def, parsed: p, bus, layerGains, tier, retireAt: Infinity,
      scheduler: new StepScheduler({ bpm: def.bpm, steps: p.steps, onStep: (s, t) => onStep(pb, s, t) }),
    }
    pb.scheduler.start(now + START_DELAY_SEC)
    return pb
  }

  function retire(pb: Playback, now: number): void {
    // A context that is not running has rendered nothing: the outgoing bus is
    // still silent (its param.value would wrongly read the default 1) and
    // currentTime is frozen, so a queued fade would never end. Drop it now.
    if (ctx.state !== 'running') {
      try { pb.bus.disconnect() } catch { /* already gone */ }
      return
    }
    crossfade(pb.bus.gain, null, now, CROSSFADE_SEC)
    pb.retireAt = now + CROSSFADE_SEC
    retiring.push(pb)
  }

  function tick(): void {
    const now = ctx.currentTime
    if ((ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') && (!resuming || Date.now() - resumeStartedAt > RESUME_RETRY_MS)) {
      resuming = true
      resumeStartedAt = Date.now()
      ctx.resume().catch(() => { /* needs a user gesture */ }).finally(() => { resuming = false })
    }
    if (retiring.length > 0) {
      const keep: Playback[] = []
      for (const pb of retiring) {
        if (now >= pb.retireAt) {
          try { pb.bus.disconnect() } catch { /* already gone */ }
        } else keep.push(pb)
      }
      retiring = keep
    }
    if (current) current.scheduler.tick(now)
    if (!current && retiring.length === 0 && timer !== null) {
      clearI(timer)
      timer = null
    }
  }

  function ensureTimer(): void {
    if (timer === null && !paused) timer = setI(tick, TICK_MS)
  }

  return {
    play(id: TrackId): void {
      if (current && current.def.id === id) return
      const def = defs.find(d => d.id === id)
      if (!def) throw new Error(`unknown track ${id}`)
      const now = ctx.currentTime
      const next = build(def, now)
      if (current) retire(current, now)
      crossfade(null, next.bus.gain, now, CROSSFADE_SEC)
      current = next
      ensureTimer()
      if (!paused) tick()
    },

    stop(): void {
      if (!current) return
      retire(current, ctx.currentTime)
      current = null
      ensureTimer()
    },

    setCombo(c: number): void {
      combo = c
      if (!current) return
      const tier = effectiveTier(current.def, c)
      if (tier === current.tier) return
      current.tier = tier
      const active = layersForTier(tier)
      const now = ctx.currentTime
      const running = ctx.state === 'running'
      for (const l of LAYERS) {
        const p = current.layerGains[l].gain
        if (!running) {
          // Nothing rendered yet: param.value is stale, so set the target outright.
          p.cancelScheduledValues(now)
          p.setValueAtTime(active[l] ? 1 : 0, now)
          continue
        }
        hold(p, now)
        p.linearRampToValueAtTime(active[l] ? 1 : 0, now + LAYER_FADE_SEC)
      }
    },

    /**
     * Hidden tab: browsers throttle timers to ~1 Hz, which would leave a sparse
     * stutter. Stop the scheduler (already-scheduled notes finish within the
     * look-ahead); resume re-syncs and skips stale steps (R1.5).
     */
    setPaused(p: boolean): void {
      if (p === paused) return
      paused = p
      if (p) {
        if (timer !== null) { clearI(timer); timer = null }
      } else if (current || retiring.length > 0) {
        ensureTimer()
        tick()
      }
    },

    /** Stop everything now: clear the timer and disconnect every bus. */
    dispose(): void {
      for (const pb of [...retiring, ...(current ? [current] : [])]) {
        try { pb.bus.disconnect() } catch { /* already gone */ }
      }
      current = null
      retiring = []
      if (timer !== null) { clearI(timer); timer = null }
    },

    currentTrack(): TrackId | null { return current ? current.def.id : null },
    currentTier(): number | null { return current ? current.tier : null },
    tick,
  }
}

export type MusicEngine = ReturnType<typeof createMusicEngine>
