/**
 * Background music sequencer — generates looping spooky music procedurally
 * using the Web Audio API. No external files required.
 *
 * Each stage has a MusicPattern: a sequence of notes the sequencer loops.
 * The sequencer uses an OscillatorNode through a low-pass filter for an
 * organ-like timbre.
 */

import { getAudioContext, getMasterGain } from './context'

interface Note {
  freq: number   // Hz (0 = rest)
  dur: number    // beats
}

interface MusicPattern {
  bpm: number
  notes: Note[]
  filterFreq: number  // low-pass cutoff for timbre
  volume: number
}

// ─── Stage patterns ───────────────────────────────────────────────────────────

// Note frequencies (minor pentatonic / diminished scale for spooky feel)
const A3 = 220, C4 = 261.6, D4 = 293.7, Eb4 = 311.1, F4 = 349.2,
      G4 = 392, Ab4 = 415.3, Bb4 = 466.2, Eb5 = 622.3

const PATTERNS: MusicPattern[] = [
  // Stage 1 — The Graveyard: slow, sparse organ
  {
    bpm: 52, filterFreq: 600, volume: 0.12,
    notes: [
      { freq: A3, dur: 2 }, { freq: 0, dur: 1 }, { freq: C4, dur: 1 },
      { freq: Eb4, dur: 2 }, { freq: 0, dur: 2 }, { freq: D4, dur: 1 },
      { freq: 0, dur: 1 }, { freq: A3, dur: 4 },
    ],
  },
  // Stage 2 — Haunted Forest: medium pace, bats-like flutter
  {
    bpm: 72, filterFreq: 900, volume: 0.13,
    notes: [
      { freq: A3, dur: 1 }, { freq: C4, dur: 1 }, { freq: Eb4, dur: 1 }, { freq: F4, dur: 1 },
      { freq: G4, dur: 2 }, { freq: 0, dur: 1 }, { freq: F4, dur: 1 },
      { freq: Eb4, dur: 1 }, { freq: C4, dur: 1 }, { freq: A3, dur: 2 }, { freq: 0, dur: 2 },
    ],
  },
  // Stage 3 — The Crypt: darker, more dissonant
  {
    bpm: 66, filterFreq: 700, volume: 0.14,
    notes: [
      { freq: A3, dur: 1 }, { freq: Eb4, dur: 1 }, { freq: Ab4, dur: 2 },
      { freq: G4, dur: 1 }, { freq: 0, dur: 1 }, { freq: Eb4, dur: 1 }, { freq: Ab4, dur: 1 },
      { freq: A3, dur: 4 },
    ],
  },
  // Stage 4 — Witch's Tower: faster, urgency
  {
    bpm: 96, filterFreq: 1100, volume: 0.14,
    notes: [
      { freq: A3, dur: 1 }, { freq: C4, dur: 1 }, { freq: Eb4, dur: 1 }, { freq: Bb4, dur: 1 },
      { freq: Ab4, dur: 2 }, { freq: G4, dur: 1 }, { freq: F4, dur: 1 },
      { freq: Eb4, dur: 1 }, { freq: D4, dur: 1 }, { freq: C4, dur: 2 }, { freq: 0, dur: 2 },
    ],
  },
  // Stage 5 — The Boss: dramatic, heavy
  {
    bpm: 88, filterFreq: 800, volume: 0.16,
    notes: [
      { freq: A3, dur: 1 }, { freq: 0, dur: 0.5 }, { freq: A3, dur: 0.5 },
      { freq: Eb5, dur: 2 }, { freq: 0, dur: 0.5 },
      { freq: Eb4, dur: 0.5 }, { freq: Ab4, dur: 1 }, { freq: Eb5, dur: 1 },
      { freq: D4, dur: 2 }, { freq: 0, dur: 1 }, { freq: C4, dur: 1 },
    ],
  },
]

// ─── Sequencer state ──────────────────────────────────────────────────────────

let currentStage = 0
let sequencerTimer: ReturnType<typeof setTimeout> | null = null
let gainNode: GainNode | null = null
let noteIndex = 0

function stopSequencer(): void {
  if (sequencerTimer !== null) {
    clearTimeout(sequencerTimer)
    sequencerTimer = null
  }
  if (gainNode) {
    gainNode.gain.setTargetAtTime(0, getAudioContext().currentTime, 0.3)
    gainNode = null
  }
}

function scheduleNote(pattern: MusicPattern): void {
  const note = pattern.notes[noteIndex % pattern.notes.length]
  noteIndex++

  const beatMs = (60 / pattern.bpm) * 1000
  const durationMs = note.dur * beatMs

  if (note.freq > 0 && gainNode) {
    const ctx = getAudioContext()
    const osc = ctx.createOscillator()
    const noteGain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    filter.type = 'lowpass'
    filter.frequency.value = pattern.filterFreq

    osc.type = 'sawtooth'
    osc.frequency.value = note.freq

    const t = ctx.currentTime
    noteGain.gain.setValueAtTime(0, t)
    noteGain.gain.linearRampToValueAtTime(pattern.volume, t + 0.02)
    noteGain.gain.setValueAtTime(pattern.volume, t + durationMs / 1000 * 0.7)
    noteGain.gain.linearRampToValueAtTime(0, t + durationMs / 1000 * 0.95)

    osc.connect(filter)
    filter.connect(noteGain)
    noteGain.connect(getMasterGain())

    osc.start(t)
    osc.stop(t + durationMs / 1000 + 0.05)
  }

  sequencerTimer = setTimeout(() => scheduleNote(pattern), durationMs)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startMusic(stage: number): void {
  const patternIndex = Math.min(stage - 1, PATTERNS.length - 1)
  if (currentStage === patternIndex && sequencerTimer !== null) return // already playing

  stopSequencer()
  currentStage = patternIndex
  noteIndex = 0

  // Brief fade-in gain
  const ctx = getAudioContext()
  gainNode = ctx.createGain()
  gainNode.gain.setValueAtTime(0, ctx.currentTime)
  gainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.5)
  gainNode.connect(getMasterGain())

  scheduleNote(PATTERNS[patternIndex])
}

export function stopMusic(): void {
  stopSequencer()
  currentStage = 0
}
