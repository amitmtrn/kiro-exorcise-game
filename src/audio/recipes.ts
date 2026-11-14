/**
 * Procedural SFX as data (playtest-polish R6). `sfx.ts` plays a recipe with Web Audio nodes;
 * `renderRecipe` renders the same recipe offline to samples so peak and RMS can be measured and
 * the per-sound gain table verified without a browser. No audio files: everything is synthesised.
 */
import { VOICE_PEAKS } from './music/voices'


export const SFX_IDS = ['ghostHit', 'batHit', 'skullHit', 'lifeLost', 'combo', 'stageClear', 'bossHit', 'bossDefeated', 'wispLink', 'shield'] as const
export type SfxId = (typeof SFX_IDS)[number]

export interface ToneVoice {
  kind: 'tone'
  type: 'sine' | 'sawtooth'
  hz: number
  /** Exponential glide to this frequency over `glideSec`. */
  toHz?: number
  glideSec?: number
  peak: number
  attack: number
  sustain: number
  release: number
  /** Start delay, seconds. */
  at: number
  /** Oscillator stop = start + attack + sustain + release + tail (default 0.05). */
  tail?: number
}

export interface NoiseVoice {
  kind: 'noise'
  /** Band-pass centre, Q 1.5. */
  hz: number
  peak: number
  dur: number
  at: number
}

export type Voice = ToneVoice | NoiseVoice

const tone = (type: ToneVoice['type'], hz: number, peak: number, attack: number, sustain: number, release: number, at = 0, extra: Partial<ToneVoice> = {}): ToneVoice =>
  ({ kind: 'tone', type, hz, peak, attack, sustain, release, at, ...extra })
const noise = (hz: number, peak: number, dur: number, at = 0): NoiseVoice => ({ kind: 'noise', hz, peak, dur, at })

/** Combo chime pitch: rises with the multiplier (played only when the tier changes). */
export function comboFreq(combo: number): number { return Math.min(220 * combo, 1760) }

/** Worst-case combo tier used for loudness measurement. */
export const COMBO_TIERS: readonly number[] = [2, 3, 4]

const FANFARE = [261.6, 329.6, 392.0, 523.3, 659.3]

/** Voices of one SFX at its raw (pre-normalisation) levels. `arg` is the combo multiplier for `combo`. */
export function recipeFor(id: SfxId, arg = 2): Voice[] {
  switch (id) {
    case 'ghostHit': return [noise(1200, 0.3, 0.18), tone('sine', 880, 0.15, 0.01, 0.02, 0.12)]
    case 'batHit': return [tone('sine', 1600, 0.25, 0.005, 0.04, 0.08, 0, { toHz: 800, glideSec: 0.12, tail: 0.055 })]
    case 'skullHit': return [tone('sine', 80, 0.5, 0.005, 0.05, 0.25), noise(300, 0.2, 0.3, 0.05)]
    case 'lifeLost': return [tone('sawtooth', 440, 0.4, 0.01, 0.1, 0.4, 0, { toHz: 110, glideSec: 0.5, tail: 0.09 })]
    case 'combo': return [tone('sine', comboFreq(arg), 0.3, 0.005, 0.05, 0.15)]
    case 'stageClear': return [261.6, 329.6, 392.0, 523.3].map((f, i) => tone('sine', f, 0.4, 0.01, 0.15, 0.2, i * 0.25))
    case 'bossHit': return [tone('sine', 60, 0.6, 0.005, 0.1, 0.3), noise(200, 0.2, 0.25, 0.05)]
    case 'wispLink': return [tone('sine', 660, 0.25, 0.005, 0.03, 0.12), tone('sine', 990, 0.22, 0.005, 0.03, 0.15, 0.08)]
    case 'shield': return [noise(3000, 0.2, 0.08), tone('sine', 1800, 0.2, 0.002, 0.01, 0.08)]
    case 'bossDefeated': return FANFARE.flatMap((f, i) => [
      tone('sine', f, 0.45, 0.01, 0.2, 0.25, i * 0.3),
      tone('sine', f * 2, 0.15, 0.01, 0.1, 0.2, i * 0.3),
    ])
  }
}

// ─── Gain table (normalisation) ──────────────────────────────────────────────

/** Targets before the limiter (R6.2). */
export const TARGET_RMS_DB = -22
export const PEAK_CEIL_DB = -3
/** Music estimated RMS sits this far under the SFX target. */
export const MUSIC_BELOW_SFX_DB = 6

/**
 * Per-SFX gain, produced by `gainFor(renderRecipe(id))` (floored to 2 decimals) and checked by tests.
 * Every id has an entry.
 */
export const SFX_GAIN: Readonly<Record<SfxId, number>> = {
  ghostHit: 1.25,
  batHit: 0.67,
  skullHit: 0.41,
  lifeLost: 0.59,
  combo: 0.61,
  stageClear: 0.35,
  bossHit: 0.29,
  bossDefeated: 0.28,
  wispLink: 0.78,
  shield: 1.03,
}

/** Music bus gain (`musicGainFor(estimateMusicLevel())`, floored to 2 decimals). */
export const MUSIC_GAIN = 0.23

const db = (x: number): number => 20 * Math.log10(x)
const lin = (d: number): number => Math.pow(10, d / 20)
export { db as toDb, lin as fromDb }

// ─── Offline renderer ────────────────────────────────────────────────────────

function envAt(v: { peak: number; attack: number; sustain: number; release: number }, t: number): number {
  const { peak, attack, sustain, release } = v
  if (t < 0) return 0
  if (t < attack) return peak * (t / attack)
  if (t < attack + sustain) return peak
  const end = attack + sustain + release
  if (t < end) return peak * Math.pow(0.001 / peak, (t - attack - sustain) / release)
  return 0.001 // exponentialRamp target: the gain rests at 0.001 until the oscillator stops
}

/** Deterministic white noise, xorshift32 like the live one. */
function makeNoise(seed = 0x2545f491): () => number {
  let s = seed
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return ((s >>> 0) / 4294967296) * 2 - 1
  }
}

/** Renders one voice into `out` (added). */
function renderVoice(v: Voice, sr: number, out: Float32Array): void {
  const start = Math.round(v.at * sr)
  if (v.kind === 'tone') {
    const len = v.attack + v.sustain + v.release + (v.tail ?? 0.05)
    const n = Math.min(out.length - start, Math.ceil(len * sr))
    let phase = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      let hz = v.hz
      if (v.toHz !== undefined && v.glideSec) hz = t >= v.glideSec ? v.toHz : v.hz * Math.pow(v.toHz / v.hz, t / v.glideSec)
      phase += hz / sr
      phase -= Math.floor(phase)
      const w = v.type === 'sine' ? Math.sin(2 * Math.PI * phase) : 2 * phase - 1
      out[start + i] += w * envAt(v, t)
    }
    return
  }
  // noise → RBJ band-pass (0 dB peak gain), Q 1.5 → envelope (attack 0.01, sustain 0.3 d, release 0.6 d)
  const n = Math.min(out.length - start, Math.ceil((v.dur + 0.05) * sr))
  const w0 = (2 * Math.PI * v.hz) / sr
  const alpha = Math.sin(w0) / (2 * 1.5)
  const a0 = 1 + alpha, b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - alpha) / a0
  const rnd = makeNoise()
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  const env = { peak: v.peak, attack: 0.01, sustain: v.dur * 0.3, release: v.dur * 0.6 }
  for (let i = 0; i < n; i++) {
    const x = rnd()
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x; y2 = y1; y1 = y
    out[start + i] += y * envAt(env, i / sr)
  }
}

/** Length in seconds of a recipe including tails. */
export function recipeSeconds(voices: Voice[]): number {
  return Math.max(...voices.map((v) => v.at + (v.kind === 'tone' ? v.attack + v.sustain + v.release + (v.tail ?? 0.05) : v.dur + 0.05)))
}

/**
 * Pure offline render of an SFX at its raw level (`gain` 1) or scaled by `gain`.
 * `arg` = combo multiplier for the combo chime.
 */
export function renderRecipe(id: SfxId, sampleRate = 22050, gain = 1, arg = 2): Float32Array {
  const voices = recipeFor(id, arg)
  const out = new Float32Array(Math.ceil(recipeSeconds(voices) * sampleRate) + 1)
  for (const v of voices) renderVoice(v, sampleRate, out)
  if (gain !== 1) for (let i = 0; i < out.length; i++) out[i] *= gain
  return out
}

export interface Level { peak: number; rms: number }

/** Sample peak and RMS over the active span (first to last sample above 1 % of the peak). */
export function measure(samples: Float32Array): Level {
  let peak = 0
  for (const x of samples) peak = Math.max(peak, Math.abs(x))
  if (peak === 0) return { peak: 0, rms: 0 }
  const floor = peak * 0.01
  let a = 0, b = samples.length - 1
  while (a < b && Math.abs(samples[a]) < floor) a++
  while (b > a && Math.abs(samples[b]) < floor) b--
  let sum = 0
  for (let i = a; i <= b; i++) sum += samples[i] * samples[i]
  return { peak, rms: Math.sqrt(sum / (b - a + 1)) }
}

/** Gain that brings a raw level to the RMS target without exceeding the peak ceiling. */
export function gainFor(l: Level): number {
  if (l.peak === 0 || l.rms === 0) return 1
  return Math.min(lin(TARGET_RMS_DB) / l.rms, lin(PEAK_CEIL_DB) / l.peak)
}

/** Worst raw level of an id over its variants (combo tiers). */
export function rawLevel(id: SfxId, sampleRate = 22050): Level {
  const variants = id === 'combo' ? COMBO_TIERS : [2]
  const ls = variants.map((n) => measure(renderRecipe(id, sampleRate, 1, n)))
  return { peak: Math.max(...ls.map((l) => l.peak)), rms: Math.max(...ls.map((l) => l.rms)) }
}

// ─── Music level estimate ────────────────────────────────────────────────────

/**
 * Music is a graph of scheduled voices, not a buffer, so its level is an analytic estimate at the
 * busiest tier (all six layers on). Per voice: `peak` is the envelope peak in voices.ts,
 * `rmsFactor` the RMS of its waveform relative to that peak (sine 0.71, triangle 0.58,
 * band-limited saw about 0.5, filtered noise 0.35 to 0.5) and `duty` the fraction of time it sounds.
 * RMS adds incoherently (sum of squares); the worst-case peak is the plain sum of voice peaks.
 */
export const MUSIC_VOICES: ReadonlyArray<{ name: string; peak: number; rmsFactor: number; duty: number }> = [
  { name: 'bass', peak: VOICE_PEAKS.bass, rmsFactor: 0.5, duty: 0.7 },
  { name: 'kick', peak: VOICE_PEAKS.kickAccent, rmsFactor: 0.71, duty: 0.25 },
  { name: 'snare', peak: VOICE_PEAKS.snareAccent + VOICE_PEAKS.snareTone, rmsFactor: 0.35, duty: 0.15 },
  { name: 'hat', peak: VOICE_PEAKS.hatAccent, rmsFactor: 0.5, duty: 0.16 },
  { name: 'lead', peak: VOICE_PEAKS.lead * VOICE_PEAKS.leadHeadroom, rmsFactor: 0.5, duty: 0.85 },
  { name: 'arp', peak: VOICE_PEAKS.arp, rmsFactor: 0.58, duty: 0.5 },
]

/** Estimated music level at music gain 1. */
export function estimateMusicLevel(): Level {
  let sumSq = 0, peak = 0
  for (const v of MUSIC_VOICES) {
    sumSq += (v.peak * v.rmsFactor) ** 2 * v.duty
    peak += v.peak
  }
  return { peak, rms: Math.sqrt(sumSq) }
}

/** Music gain that puts the estimated RMS `MUSIC_BELOW_SFX_DB` under the SFX target. */
export function musicGainFor(l: Level): number {
  return lin(TARGET_RMS_DB - MUSIC_BELOW_SFX_DB) / l.rms
}
