/**
 * Note renderers for the music engine. Each function schedules a short-lived
 * node graph at an exact audio time and connects it to `dest` (a layer gain).
 * Nodes are never reused; they are garbage collected after `stop`.
 */

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** One shared 0.5 s noise buffer per AudioContext, from a fixed-seed generator. */
const noiseCache = new WeakMap<object, AudioBuffer>()
export function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx)
  if (!buf) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.5))
    buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let seed = 0x2545f491
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0   // LCG
      data[i] = seed / 0x80000000 - 1
    }
    noiseCache.set(ctx, buf)
  }
  return buf
}

/** Gain envelope on absolute times: 0 → peak by t+attack, hold to holdUntil, 0 at endAt. */
function env(ctx: AudioContext, dest: AudioNode, t: number, peak: number, attack: number, holdUntil: number, endAt: number): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.setValueAtTime(peak, Math.max(t + attack, holdUntil))
  g.gain.linearRampToValueAtTime(0, endAt)
  g.connect(dest)
  return g
}

function osc(ctx: AudioContext, type: OscillatorType, freq: number, t: number, stopAt: number, out: AudioNode): OscillatorNode {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.connect(out)
  o.start(t)
  o.stop(stopAt)
  return o
}

function noise(ctx: AudioContext, t: number, stopAt: number, out: AudioNode): AudioBufferSourceNode {
  const n = ctx.createBufferSource()
  n.buffer = getNoiseBuffer(ctx)
  n.connect(out)
  n.start(t)
  n.stop(stopAt)
  return n
}

function filter(ctx: AudioContext, type: BiquadFilterType, freq: number, out: AudioNode, q = 1): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  f.connect(out)
  return f
}

export function playBass(ctx: AudioContext, dest: AudioNode, t: number, midi: number, durSec: number): void {
  const end = t + Math.max(0.08, durSec)
  const g = env(ctx, dest, t, 0.18, 0.01, t + (end - t) * 0.6, end)
  const f = filter(ctx, 'lowpass', 420, g)
  osc(ctx, 'sawtooth', midiToHz(midi), t, end + 0.02, f)
}

export function playKick(ctx: AudioContext, dest: AudioNode, t: number, accent: boolean): void {
  const peak = accent ? 0.45 : 0.36
  const g = ctx.createGain()
  g.gain.setValueAtTime(peak, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
  g.connect(dest)
  const o = osc(ctx, 'sine', 150, t, t + 0.22, g)
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  // short noise click for the beater
  const cg = env(ctx, g, t, 0.25, 0.001, t + 0.005, t + 0.015)
  noise(ctx, t, t + 0.02, cg)
}

export function playSnare(ctx: AudioContext, dest: AudioNode, t: number, accent: boolean): void {
  const peak = accent ? 0.26 : 0.2
  const g = env(ctx, dest, t, peak, 0.002, t + 0.03, t + 0.16)
  const bp = filter(ctx, 'bandpass', 1800, g, 0.8)
  noise(ctx, t, t + 0.17, bp)
  const tg = env(ctx, dest, t, 0.12, 0.002, t + 0.02, t + 0.1)
  osc(ctx, 'triangle', 190, t, t + 0.11, tg)
}

export function playHat(ctx: AudioContext, dest: AudioNode, t: number, accent: boolean): void {
  const len = accent ? 0.09 : 0.04
  const g = env(ctx, dest, t, accent ? 0.11 : 0.07, 0.001, t + 0.005, t + len)
  const hp = filter(ctx, 'highpass', 7000, g)
  noise(ctx, t, t + len + 0.01, hp)
}

export function playLead(ctx: AudioContext, dest: AudioNode, t: number, midi: number, durSec: number): void {
  const end = t + Math.max(0.1, durSec * 0.95)
  const g = env(ctx, dest, t, 0.12, 0.015, t + (end - t) * 0.85, end)
  const f = filter(ctx, 'lowpass', 2200, g)
  const hz = midiToHz(midi)
  osc(ctx, 'triangle', hz, t, end + 0.02, f)
  const sq = ctx.createGain()
  sq.gain.value = 0.25
  sq.connect(f)
  const o = osc(ctx, 'square', hz * 1.005, t, end + 0.02, sq)
  void o
}

export function playArp(ctx: AudioContext, dest: AudioNode, t: number, midi: number): void {
  const end = t + 0.1
  const g = env(ctx, dest, t, 0.07, 0.004, t + 0.01, end)
  osc(ctx, 'triangle', midiToHz(midi), t, end + 0.02, g)
}
