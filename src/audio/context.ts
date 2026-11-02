/**
 * AudioContext singleton — created lazily on the first user gesture to satisfy
 * browser autoplay policy.
 */

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let muted = false
let volume = 1.0

const STORAGE_KEY = 'exorcise-volume'

function loadVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '1')
    return isNaN(v) ? 1.0 : Math.max(0, Math.min(1, v))
  } catch {
    return 1.0
  }
}

function saveVolume(v: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(v)) } catch { /* ignore */ }
}

export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    masterGain = ctx.createGain()
    masterGain.gain.value = muted ? 0 : volume
    masterGain.connect(ctx.destination)
    volume = loadVolume()
    masterGain.gain.value = muted ? 0 : volume
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => { /* ignore */ })
  }
  return ctx
}

export function getMasterGain(): GainNode {
  getAudioContext() // ensures masterGain is created
  return masterGain!
}

export function setMuted(m: boolean): void {
  muted = m
  if (masterGain) masterGain.gain.value = muted ? 0 : volume
}

export function isMuted(): boolean { return muted }

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v))
  saveVolume(volume)
  if (masterGain && !muted) masterGain.gain.value = volume
}

export function getVolume(): number { return volume }

export function toggleMute(): void { setMuted(!muted) }
