/**
 * Original music patterns (music-v2). Plain data plus a pure parser.
 *
 * Every voice is a string of whitespace-separated tokens, one per 1/16 step.
 *   pitched: note name starts a note, `_` holds it one more step, `.` rests
 *   drums:   `x` hit, `X` accented hit, `.` rest
 * All pitches are written in A minor (with b2 and raised 7th available) and
 * transposed at playback by `transpose` semitones.
 */

export type TrackId = 'title' | 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'boss'

export interface TrackDef {
  id: TrackId
  bpm: number
  transpose: number
  fixedTier?: number
  minTier?: number
  bass: string
  kick: string
  snare: string
  hat: string
  lead: string
  arp: string
}

export interface NoteEvent { midi: number; lenSteps: number }
export interface StepEvent {
  bass?: NoteEvent
  lead?: NoteEvent
  arp?: NoteEvent
  kick?: boolean   // value = accent
  snare?: boolean
  hat?: boolean
}
export interface ParsedTrack { steps: number; stepEvents: StepEvent[] }

export const STEPS_PER_BAR = 16
/** Semitone offsets from A that are allowed: A minor + flat 2nd + raised 7th. */
export const ALLOWED_OFFSETS: readonly number[] = [0, 1, 2, 3, 5, 7, 8, 10, 11]
export const A_PITCH_CLASS = 9

// ─── Parsing ──────────────────────────────────────────────────────────────────

const NOTE_RE = /^([A-G])([b#]?)(\d)$/
const BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** MIDI number for a note name like `Bb3` (C4 = 60). Throws on bad input. */
export function noteToMidi(name: string): number {
  const m = NOTE_RE.exec(name)
  if (!m) throw new Error(`bad note name: ${name}`)
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (Number(m[3]) + 1) * 12 + BASE[m[1]] + acc
}

export function tokens(s: string): string[] {
  return s.trim().split(/\s+/).filter(t => t.length > 0)
}

function parsePitched(voice: string, s: string): Array<NoteEvent | undefined> {
  const toks = tokens(s)
  const out: Array<NoteEvent | undefined> = new Array(toks.length).fill(undefined)
  let cur: NoteEvent | null = null
  toks.forEach((t, i) => {
    if (t === '.') { cur = null; return }
    if (t === '_') {
      if (!cur) throw new Error(`${voice}: hold with no note at step ${i}`)
      cur.lenSteps++
      return
    }
    cur = { midi: noteToMidi(t), lenSteps: 1 }
    out[i] = cur
  })
  return out
}

function parseDrum(voice: string, s: string): Array<boolean | undefined> {
  return tokens(s).map((t, i) => {
    if (t === '.') return undefined
    if (t === 'x') return false
    if (t === 'X') return true
    throw new Error(`${voice}: bad drum token "${t}" at step ${i}`)
  })
}

export function parseTrack(def: TrackDef): ParsedTrack {
  const bass = parsePitched('bass', def.bass)
  const lead = parsePitched('lead', def.lead)
  const arp = parsePitched('arp', def.arp)
  const kick = parseDrum('kick', def.kick)
  const snare = parseDrum('snare', def.snare)
  const hat = parseDrum('hat', def.hat)
  const steps = bass.length
  for (const [name, v] of [['lead', lead], ['arp', arp], ['kick', kick], ['snare', snare], ['hat', hat]] as const) {
    if (v.length !== steps) throw new Error(`${def.id}: ${name} has ${v.length} steps, bass has ${steps}`)
  }
  if (steps === 0 || steps % STEPS_PER_BAR !== 0) {
    throw new Error(`${def.id}: ${steps} steps is not a whole number of bars`)
  }
  const stepEvents: StepEvent[] = []
  for (let i = 0; i < steps; i++) {
    const e: StepEvent = {}
    if (bass[i]) e.bass = bass[i]
    if (lead[i]) e.lead = lead[i]
    if (arp[i]) e.arp = arp[i]
    if (kick[i] !== undefined) e.kick = kick[i]
    if (snare[i] !== undefined) e.snare = snare[i]
    if (hat[i] !== undefined) e.hat = hat[i]
    stepEvents.push(e)
  }
  return { steps, stepEvents }
}

// ─── Authoring helpers (return strings only) ─────────────────────────────────

/** Fill a 16-token template: R, F, … are replaced from `notes`. */
function bar(template: string, notes: Record<string, string> = {}): string {
  return tokens(template).map(t => notes[t] ?? t).join(' ')
}
const join = (...bars: string[]): string => bars.join(' ')
const rep = (b: string, n: number): string => Array(n).fill(b).join(' ')
/** 16th-note arpeggio bar cycling a-b-c-b. */
function arpBar(a: string, b: string, c: string): string {
  return rep(`${a} ${b} ${c} ${b}`, 4)
}
/** Arpeggio bar that plays only on beats (8th-note pulse), rests between. */
function arpPulse(a: string, b: string): string {
  return rep(`${a} . ${b} .`, 4)
}

const REST = '. . . . . . . . . . . . . . . .'

// Drum bars
const KICK_4 = 'x . . . x . . . x . . . x . . .'
const KICK_BASIC = 'x . . . . . . . x . . . . . x .'
const KICK_SYNC = 'x . . x . . x . x . . . . x . .'
const KICK_GALLOP = 'X . . x . . . . x . x . . . . .'
const SNARE_BACK = '. . . . x . . . . . . . x . . .'
const SNARE_FILL = '. . . . x . . . . . . . x . x x'
const HAT_8 = 'x . x . x . x . x . x . x . x .'
const HAT_SPARSE = 'x . . . x . . . x . . . x . . .'
const HAT_16 = 'X . x . X . x . X . x . X . x x'

// ─── Tracks ───────────────────────────────────────────────────────────────────

export const TRACKS: TrackDef[] = [
  // Title: cheerful-creepy, medium tempo, always bass + drums + lead.
  {
    id: 'title', bpm: 92, transpose: 0, fixedTier: 3,
    bass: join(
      bar('R _ . R . . R . F _ . . R . G .', { R: 'A2', F: 'E3', G: 'G2' }),
      bar('R _ . R . . R . F _ . . R . G .', { R: 'Bb2', F: 'F3', G: 'A2' }),
      bar('R _ . R . . R . F _ . . R . G .', { R: 'A2', F: 'E3', G: 'G2' }),
      bar('R _ . R . . R . F _ . . B . R .', { R: 'E2', F: 'G#2', B: 'B2' }),
    ),
    kick: rep(KICK_BASIC, 4),
    snare: rep(SNARE_BACK, 4),
    hat: rep(HAT_8, 4),
    lead: join(
      'E4 _ _ _ C5 _ . . B4 _ _ _ A4 _ _ _',
      'D5 _ _ _ C5 _ _ _ Bb4 _ _ _ A4 _ . .',
      'E4 _ _ _ A4 _ _ . C5 _ _ _ E5 _ _ _',
      'D5 _ _ _ B4 _ _ _ G#4 _ _ _ . . . .',
    ),
    arp: join(
      arpBar('A4', 'C5', 'E5'), arpBar('Bb4', 'D5', 'F5'),
      arpBar('A4', 'C5', 'E5'), arpBar('E4', 'G#4', 'B4'),
    ),
  },
  // Stage 1 — The Graveyard: slow and sparse.
  {
    id: 'stage1', bpm: 80, transpose: -2,
    bass: join(
      bar('R _ _ _ . . . . F _ _ _ . . . .', { R: 'A2', F: 'E3' }),
      bar('R _ _ _ . . . . F _ _ _ . . . .', { R: 'A2', F: 'C3' }),
      bar('R _ _ _ . . . . F _ _ _ . . . .', { R: 'D3', F: 'A2' }),
      bar('R _ _ _ . . . . F _ _ _ . . R .', { R: 'E2', F: 'B2' }),
    ),
    kick: rep(KICK_4, 4),
    snare: join(REST, REST, REST, SNARE_FILL),
    hat: rep(HAT_SPARSE, 4),
    lead: join(
      'A4 _ _ _ _ _ _ _ C5 _ _ _ B4 _ _ _',
      'A4 _ _ _ _ _ _ _ . . . . E4 _ _ _',
      'F4 _ _ _ A4 _ _ _ D5 _ _ _ _ _ _ _',
      'B4 _ _ _ G#4 _ _ _ E4 _ _ _ _ _ _ _',
    ),
    arp: join(
      arpPulse('A4', 'E5'), arpPulse('A4', 'C5'),
      arpPulse('D5', 'F5'), arpPulse('E5', 'B4'),
    ),
  },
  // Stage 2 — Haunted Forest: brisk and fluttery.
  {
    id: 'stage2', bpm: 104, transpose: 0,
    bass: join(
      bar('R . R . F . R . R . R . F . G .', { R: 'A2', F: 'E3', G: 'G2' }),
      bar('R . R . F . R . R . R . F . G .', { R: 'F2', F: 'C3', G: 'E2' }),
      bar('R . R . F . R . R . R . F . G .', { R: 'D2', F: 'A2', G: 'C3' }),
      bar('R . R . F . R . R . R . F . G .', { R: 'E2', F: 'B2', G: 'G#2' }),
    ),
    kick: rep(KICK_SYNC, 4),
    snare: rep(SNARE_BACK, 4),
    hat: rep(HAT_8, 4),
    lead: join(
      'A4 . C5 . E5 . C5 . D5 _ . . C5 _ . .',
      'C5 . F5 . E5 . C5 . A4 _ . . . . . .',
      'D5 . F5 . A5 . F5 . E5 _ . . D5 _ . .',
      'B4 . E5 . G#5 . E5 . B5 _ _ _ . . . .',
    ),
    arp: join(
      arpBar('A4', 'C5', 'E5'), arpBar('F4', 'A4', 'C5'),
      arpBar('D5', 'F5', 'A5'), arpBar('E5', 'G#5', 'B5'),
    ),
  },
  // Stage 3 — The Crypt: chromatic, uneasy.
  {
    id: 'stage3', bpm: 96, transpose: 3,
    bass: join(
      bar('R _ _ . R _ . . Q _ _ . R _ . .', { R: 'A2', Q: 'Bb2' }),
      bar('R _ _ . R _ . . Q _ _ . R _ . .', { R: 'Bb2', Q: 'B2' }),
      bar('R _ _ . R _ . . Q _ _ . R _ . .', { R: 'A2', Q: 'Bb2' }),
      bar('R _ _ . R _ . . Q _ _ . R _ . .', { R: 'G#2', Q: 'A2' }),
    ),
    kick: rep(KICK_BASIC, 4),
    snare: rep(SNARE_BACK, 4),
    hat: rep(HAT_SPARSE, 4),
    lead: join(
      'E4 _ _ _ _ _ F4 _ E4 _ _ _ C4 _ _ _',
      'F4 _ _ _ _ _ Ab4 _ F4 _ _ _ D4 _ _ _',
      'E4 _ _ _ A4 _ _ _ Bb4 _ _ _ A4 _ _ _',
      'G#4 _ _ _ F4 _ _ _ E4 _ _ _ _ _ _ _',
    ),
    arp: join(
      arpBar('A4', 'C5', 'E5'), arpBar('Bb4', 'D5', 'F5'),
      arpBar('A4', 'C5', 'E5'), arpBar('G#4', 'B4', 'D5'),
    ),
  },
  // Stage 4 — Witch's Tower: fast, driving.
  {
    id: 'stage4', bpm: 120, transpose: 2,
    bass: join(
      bar('R R . R R . R . R R . R F . F .', { R: 'A2', F: 'E3' }),
      bar('R R . R R . R . R R . R F . F .', { R: 'C3', F: 'G3' }),
      bar('R R . R R . R . R R . R F . F .', { R: 'Bb2', F: 'F3' }),
      bar('R R . R R . R . R R . R F . F .', { R: 'E2', F: 'B2' }),
    ),
    kick: rep(KICK_4, 4),
    snare: join(rep(SNARE_BACK, 3), SNARE_FILL),
    hat: rep(HAT_16, 4),
    lead: join(
      'A4 _ C5 _ E5 _ _ _ D5 _ C5 _ A4 _ _ _',
      'G4 _ C5 _ E5 _ _ _ G5 _ E5 _ C5 _ _ _',
      'F4 _ Bb4 _ D5 _ _ _ F5 _ D5 _ Bb4 _ _ _',
      'E5 _ _ _ D5 _ _ _ B4 _ _ _ G#4 _ _ _',
    ),
    arp: join(
      arpBar('A4', 'C5', 'E5'), arpBar('C5', 'E5', 'G5'),
      arpBar('Bb4', 'D5', 'F5'), arpBar('E5', 'G#5', 'B5'),
    ),
  },
  // Boss — heavy gallop, never below drums.
  {
    id: 'boss', bpm: 132, transpose: -1, minTier: 2,
    bass: join(
      bar('R . R R . R R . R . R R . R F F', { R: 'A2', F: 'Bb2' }),
      bar('R . R R . R R . R . R R . R F F', { R: 'Bb2', F: 'B2' }),
      bar('R . R R . R R . R . R R . R F F', { R: 'A2', F: 'Bb2' }),
      bar('R . R R . R R . R . R R . R F F', { R: 'E2', F: 'F2' }),
    ),
    kick: rep(KICK_GALLOP, 4),
    snare: join(rep(SNARE_BACK, 3), SNARE_FILL),
    hat: rep(HAT_16, 4),
    lead: join(
      'A4 _ _ Bb4 A4 _ _ . E5 _ _ _ C5 _ _ _',
      'Bb4 _ _ B4 Bb4 _ _ . F5 _ _ _ D5 _ _ _',
      'A4 _ _ Bb4 A4 _ _ . E5 _ _ F5 E5 _ D5 _',
      'B4 _ _ _ G#4 _ _ _ E4 _ _ _ F4 _ E4 _',
    ),
    arp: join(
      arpBar('A4', 'C5', 'E5'), arpBar('Bb4', 'D5', 'F5'),
      arpBar('A4', 'C5', 'E5'), arpBar('E4', 'G#4', 'B4'),
    ),
  },
]

export const TRACK_IDS: TrackId[] = TRACKS.map(t => t.id)

export function getTrack(id: TrackId): TrackDef {
  const t = TRACKS.find(x => x.id === id)
  if (!t) throw new Error(`unknown track ${id}`)
  return t
}

/** Stage number → track id (stage 5 is the boss stage). */
export function trackForStage(stage: number): TrackId {
  if (!Number.isFinite(stage) || stage <= 1) return 'stage1'
  if (stage >= 5) return 'boss'
  return `stage${Math.trunc(stage)}` as TrackId
}
