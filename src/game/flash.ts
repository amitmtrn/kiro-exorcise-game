/**
 * Reduced flashing (playtest-polish R10, WCAG 2.3.1). A pure scheduler for the full-screen flash:
 * at most 3 flashes in any 1000 ms, a lower peak alpha and a slew-limited alpha (no hard on / off edge).
 * Times are milliseconds on the caller's clock; nothing here counts frames.
 */

export const MAX_FLASHES_PER_S = 3
export const WINDOW_MS = 1000
/** Peak alpha of the red / orange full-screen flash: normal and reduced. */
export const NORMAL_ALPHA = 0.4
export const REDUCED_ALPHA = 0.15
/** Fade-in and fade-out time of a reduced flash. */
export const RAMP_MS = 120
/** Screen-shake amplitude factor when flashing is reduced. */
export const REDUCED_SHAKE = 0.25

/**
 * Scheduler state. `alpha` is the overlay alpha now; it follows the target (peak while a flash is requested,
 * else 0) at a limited slew rate, so it never jumps (no hard on / off edges). `onsets` are the start times
 * of the flashes accepted in the last second.
 */
export interface FlashScheduler {
  alpha: number
  /** Time of the last update. */
  at: number
  /** The target is `peak` until this time, then 0. */
  targetEnd: number
  peak: number
  onsets: readonly number[]
}

export function createFlashScheduler(): FlashScheduler {
  return { alpha: 0, at: Number.NEGATIVE_INFINITY, targetEnd: Number.NEGATIVE_INFINITY, peak: REDUCED_ALPHA, onsets: [] }
}

export function shakeScale(reduced: boolean): number { return reduced ? REDUCED_SHAKE : 1 }

/** Slew limit: the cap is reached in RAMP_MS. */
const SLEW_PER_MS = REDUCED_ALPHA / RAMP_MS

function follow(alpha: number, target: number, dtMs: number): number {
  const step = SLEW_PER_MS * dtMs
  return alpha < target ? Math.min(target, alpha + step) : Math.max(target, alpha - step)
}

/** Moves the scheduler to time `now` (pure). The target switches off exactly at `targetEnd`. */
export function advance(s: FlashScheduler, now: number): FlashScheduler {
  if (!(now > s.at)) return s
  if (s.at === Number.NEGATIVE_INFINITY) return { ...s, at: now }
  let alpha = s.alpha
  let t = s.at
  if (t < s.targetEnd) {
    const until = Math.min(now, s.targetEnd)
    alpha = follow(alpha, s.peak, until - t)
    t = until
  }
  if (now > t) alpha = follow(alpha, 0, now - t)
  return { ...s, alpha, at: now }
}

/** Overlay alpha at `now`, without keeping the advanced state. */
export function flashAlphaAt(s: FlashScheduler, now: number): number {
  return advance(s, now).alpha
}

/**
 * Asks for a flash of `durMs` at `now`. A request while a flash is still showing extends it (the same flash);
 * a request that would be the 4th flash starting within the last 1000 ms is dropped. The peak is capped at
 * REDUCED_ALPHA.
 */
export function requestFlash(s0: FlashScheduler, now: number, durMs: number, alpha: number): FlashScheduler {
  const s = advance(s0, now)
  // Onsets are counted over the window plus one ramp: a flash is seen up to RAMP_MS after its onset, so any 4
  // visible flashes are then more than 1000 ms apart.
  const onsets = s.onsets.filter((t) => t > now - WINDOW_MS - RAMP_MS)
  if (now < s.targetEnd) return { ...s, onsets, targetEnd: Math.max(s.targetEnd, now + durMs) }
  if (onsets.length >= MAX_FLASHES_PER_S) return { ...s, onsets }
  return { ...s, onsets: [...onsets, now], targetEnd: now + durMs, peak: Math.min(alpha, REDUCED_ALPHA) }
}

/**
 * Simulates `requests` ({at, durMs, alpha}, any order) and samples the waveform every `stepMs` over [from, to).
 * Used by the tests and the flash-rate analysis.
 */
export function simulateWaveform(
  requests: ReadonlyArray<{ at: number; durMs: number; alpha: number }>, from: number, to: number, stepMs = 1,
): number[] {
  const sorted = [...requests].sort((a, b) => a.at - b.at)
  let s = createFlashScheduler()
  let i = 0
  const out: number[] = []
  for (let t = from; t < to; t += stepMs) {
    while (i < sorted.length && sorted[i].at <= t) { s = requestFlash(s, sorted[i].at, sorted[i].durMs, sorted[i].alpha); i++ }
    s = advance(s, t)
    out.push(s.alpha)
  }
  return out
}

/** Number of rising crossings of half the cap in a sampled waveform. */
export function countFlashes(wave: readonly number[]): number {
  const level = REDUCED_ALPHA / 2
  let n = 0
  for (let i = 1; i < wave.length; i++) if (wave[i] >= level && wave[i - 1] < level) n++
  return n
}

/** Worst number of flashes in any window of `windowMs` of a waveform sampled every `stepMs`. */
export function maxFlashesPerWindow(wave: readonly number[], stepMs = 1, windowMs = WINDOW_MS): number {
  const n = Math.round(windowMs / stepMs)
  let worst = 0
  for (let i = 0; i + n <= wave.length; i += Math.max(1, Math.round(10 / stepMs))) worst = Math.max(worst, countFlashes(wave.slice(i, i + n)))
  return worst
}

// ─── Per-canvas flash state for the renderer ─────────────────────────────────

interface Slot { sched: FlashScheduler; seenEnd: number }
const slots = new WeakMap<object, Slot>()
/** Accepted flash onsets per screen group (the two halves of a two-player screen share one budget). */
const groups = new WeakMap<object, readonly number[]>()

/**
 * Overlay alpha for the game's red flash on `key` (a canvas: each two-player half has its own). Normal mode is
 * the old constant 0.4 until `flashEndTime`. Reduced mode feeds each new `flashEndTime` to the scheduler.
 * `group` (two-player: the shared game canvas) makes all keys of the group draw their flash onsets from one
 * 3-per-second budget, so the whole screen never shows more than 3 flashes in 1000 ms (R10.2).
 */
export function overlayAlpha(key: object, flashEndTime: number, now: number, reduced: boolean, group?: object): number {
  if (!reduced) return now < flashEndTime ? NORMAL_ALPHA : 0
  let slot = slots.get(key)
  if (!slot) { slot = { sched: createFlashScheduler(), seenEnd: 0 }; slots.set(key, slot) }
  if (now < slot.sched.at) slot = { sched: createFlashScheduler(), seenEnd: 0 } // clock went backwards (demo clock -> real clock)
  slots.set(key, slot)
  if (flashEndTime !== slot.seenEnd) {
    slot.seenEnd = flashEndTime
    if (flashEndTime > now) {
      if (group) {
        // onsets stamped after `now` come from a clock that went backwards (demo clock): forget them
        const shared = (groups.get(group) ?? []).filter((t) => t <= now)
        slot.sched = requestFlash({ ...slot.sched, onsets: shared }, now, flashEndTime - now, NORMAL_ALPHA)
        groups.set(group, slot.sched.onsets)
      } else slot.sched = requestFlash(slot.sched, now, flashEndTime - now, NORMAL_ALPHA)
    }
  }
  slot.sched = advance(slot.sched, now)
  return slot.sched.alpha
}
