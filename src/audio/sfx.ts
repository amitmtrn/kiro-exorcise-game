/**
 * Procedural SFX — all sounds synthesised with Web Audio API.
 * No external files required.
 */

import { getAudioContext, getMasterGain } from './context'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): number { return getAudioContext().currentTime }

/** Create a gain envelope: attack → sustain → release. */
function envelope(
  ctx: AudioContext,
  destination: AudioNode,
  peak: number,
  attackSec: number,
  sustainSec: number,
  releaseSec: number,
): GainNode {
  const g = ctx.createGain()
  g.connect(destination)
  const t = now()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + attackSec)
  g.gain.setValueAtTime(peak, t + attackSec + sustainSec)
  g.gain.exponentialRampToValueAtTime(0.001, t + attackSec + sustainSec + releaseSec)
  return g
}

/** Play a single sine/square/sawtooth oscillator with an envelope. */
function playTone(
  freq: number,
  type: OscillatorType,
  peak: number,
  attackSec: number,
  sustainSec: number,
  releaseSec: number,
  startDelaySec = 0,
): void {
  const ctx = getAudioContext()
  const master = getMasterGain()
  const g = envelope(ctx, master, peak, attackSec, sustainSec, releaseSec)
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(g)
  const t = now() + startDelaySec
  osc.start(t)
  osc.stop(t + attackSec + sustainSec + releaseSec + 0.05)
}

/** Play filtered noise burst (whoosh/poof). */
function playNoise(
  filterFreq: number,
  peak: number,
  durationSec: number,
  startDelaySec = 0,
): void {
  const ctx = getAudioContext()
  const master = getMasterGain()

  const bufLen = Math.ceil(ctx.sampleRate * durationSec)
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1

  const src = ctx.createBufferSource()
  src.buffer = buf

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = filterFreq
  filter.Q.value = 1.5

  const g = envelope(ctx, master, peak, 0.01, durationSec * 0.3, durationSec * 0.6)
  src.connect(filter)
  filter.connect(g)

  const t = now() + startDelaySec
  src.start(t)
  src.stop(t + durationSec + 0.05)
}

// ─── SFX functions ────────────────────────────────────────────────────────────

/** Ghost hit — whoosh + short high poof */
export function sfxGhostHit(): void {
  playNoise(1200, 0.3, 0.18)
  playTone(880, 'sine', 0.15, 0.01, 0.02, 0.12)
}

/** Bat hit — short squeak */
export function sfxBatHit(): void {
  const ctx = getAudioContext()
  const master = getMasterGain()
  const g = envelope(ctx, master, 0.25, 0.005, 0.04, 0.08)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1600, now())
  osc.frequency.exponentialRampToValueAtTime(800, now() + 0.12)
  osc.connect(g)
  osc.start(now())
  osc.stop(now() + 0.18)
}

/** Skull hit (penalty) — low thud + creak */
export function sfxSkullHit(): void {
  playTone(80, 'sine', 0.5, 0.005, 0.05, 0.25)
  playNoise(300, 0.2, 0.3, 0.05)
}

/** Life lost — descending glide */
export function sfxLifeLost(): void {
  const ctx = getAudioContext()
  const master = getMasterGain()
  const g = envelope(ctx, master, 0.4, 0.01, 0.1, 0.4)
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(440, now())
  osc.frequency.exponentialRampToValueAtTime(110, now() + 0.5)
  osc.connect(g)
  osc.start(now())
  osc.stop(now() + 0.6)
}

/** Combo tier-up — chime whose pitch rises with the multiplier (played only when the tier changes) */
export function sfxCombo(combo: number): void {
  const freq = Math.min(220 * combo, 1760)
  playTone(freq, 'sine', 0.3, 0.005, 0.05, 0.15)
}

/** Stage clear — ascending 3-note fanfare */
export function sfxStageClear(): void {
  // C4 → E4 → G4 → C5
  const notes = [261.6, 329.6, 392.0, 523.3]
  notes.forEach((freq, i) => playTone(freq, 'sine', 0.4, 0.01, 0.15, 0.2, i * 0.25))
}

/** Boss hit — deep resonant thump */
export function sfxBossHit(): void {
  playTone(60, 'sine', 0.6, 0.005, 0.1, 0.3)
  playNoise(200, 0.2, 0.25, 0.05)
}

/** Boss defeated — triumphant fanfare */
export function sfxBossDefeated(): void {
  const notes = [261.6, 329.6, 392.0, 523.3, 659.3]
  notes.forEach((freq, i) => {
    playTone(freq, 'sine', 0.45, 0.01, 0.2, 0.25, i * 0.3)
    playTone(freq * 2, 'sine', 0.15, 0.01, 0.1, 0.2, i * 0.3)
  })
}
