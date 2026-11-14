/**
 * Procedural SFX — all sounds synthesised with Web Audio API.
 * No external files required.
 */

import { getAudioContext, getMasterGain } from './context'
import { recipeFor, SFX_GAIN } from './recipes'
import type { SfxId, Voice } from './recipes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): number { return getAudioContext().currentTime }

/**
 * White-noise samples come from a private generator, not Math.random: a sound effect must never
 * consume the game's random stream (demo mode seeds it to replay the same run, demo-mode R5.2).
 */
let noiseState = 0x2545f491
function noiseSample(): number {
  noiseState ^= noiseState << 13
  noiseState ^= noiseState >>> 17
  noiseState ^= noiseState << 5
  return ((noiseState >>> 0) / 4294967296) * 2 - 1
}

/** Gain envelope: attack → sustain → exponential release (same shape the offline renderer models). */
function envelope(
  ctx: AudioContext,
  destination: AudioNode,
  t: number,
  peak: number,
  attackSec: number,
  sustainSec: number,
  releaseSec: number,
): GainNode {
  const g = ctx.createGain()
  g.connect(destination)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + attackSec)
  g.gain.setValueAtTime(peak, t + attackSec + sustainSec)
  g.gain.exponentialRampToValueAtTime(0.001, t + attackSec + sustainSec + releaseSec)
  return g
}

function startVoice(ctx: AudioContext, out: AudioNode, v: Voice, t0: number): void {
  const t = t0 + v.at
  if (v.kind === 'tone') {
    const g = envelope(ctx, out, t, v.peak, v.attack, v.sustain, v.release)
    const osc = ctx.createOscillator()
    osc.type = v.type
    osc.frequency.setValueAtTime(v.hz, t)
    if (v.toHz !== undefined && v.glideSec) osc.frequency.exponentialRampToValueAtTime(v.toHz, t + v.glideSec)
    osc.connect(g)
    osc.start(t)
    osc.stop(t + v.attack + v.sustain + v.release + (v.tail ?? 0.05))
    return
  }
  const bufLen = Math.ceil(ctx.sampleRate * v.dur)
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) data[i] = noiseSample()
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = v.hz
  filter.Q.value = 1.5
  const g = envelope(ctx, out, t, v.peak, 0.01, v.dur * 0.3, v.dur * 0.6)
  src.connect(filter)
  filter.connect(g)
  src.start(t)
  src.stop(t + v.dur + 0.05)
}

/**
 * Plays an SFX recipe: every voice goes through one per-sound gain (the loudness table) into the
 * master bus, never straight to the destination.
 */
function play(id: SfxId, arg?: number): void {
  const ctx = getAudioContext()
  const out = ctx.createGain()
  out.gain.value = SFX_GAIN[id]
  out.connect(getMasterGain())
  const t0 = now()
  for (const v of recipeFor(id, arg)) startVoice(ctx, out, v, t0)
}

// ─── SFX functions ────────────────────────────────────────────────────────────

/** Ghost hit — whoosh + short high poof */
export function sfxGhostHit(): void { play('ghostHit') }

/** Bat hit — short squeak */
export function sfxBatHit(): void { play('batHit') }

/** Skull hit (penalty) — low thud + creak */
export function sfxSkullHit(): void { play('skullHit') }

/** Life lost — descending glide */
export function sfxLifeLost(): void { play('lifeLost') }

/** Combo tier-up — chime whose pitch rises with the multiplier (played only when the tier changes) */
export function sfxCombo(combo: number): void {
  play('combo', combo)
}

/** Stage clear — ascending 3-note fanfare */
export function sfxStageClear(): void { play('stageClear') }

/** Boss hit — deep resonant thump */
export function sfxBossHit(): void { play('bossHit') }

/** Boss defeated — triumphant fanfare */
export function sfxBossDefeated(): void { play('bossDefeated') }
