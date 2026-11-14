import { describe, it, expect } from 'vitest'
import {
  TRACKS, TRACK_IDS, parseTrack, noteToMidi, tokens, trackForStage, getTrack,
  ALLOWED_OFFSETS, A_PITCH_CLASS, STEPS_PER_BAR, type TrackDef,
} from './patterns'

const base: TrackDef = { ...TRACKS[0] }

describe('noteToMidi', () => {
  it('maps note names', () => {
    expect(noteToMidi('C4')).toBe(60)
    expect(noteToMidi('A4')).toBe(69)
    expect(noteToMidi('Bb2')).toBe(46)
    expect(noteToMidi('G#4')).toBe(68)
  })
  it('rejects bad names', () => {
    for (const bad of ['H2', 'A', 'a4', 'A#b4', '4A']) expect(() => noteToMidi(bad)).toThrow()
  })
})

describe('track data validity', () => {
  it('has the seven expected tracks with unique ids', () => {
    expect(TRACK_IDS).toEqual(['title', 'stage1', 'stage2', 'stage3', 'stage4', 'boss', 'finale'])
    expect(new Set(TRACK_IDS).size).toBe(TRACKS.length)
  })

  for (const def of TRACKS) {
    describe(def.id, () => {
      const parsed = parseTrack(def)

      it('parses with equal voice lengths in whole bars', () => {
        expect(parsed.steps % STEPS_PER_BAR).toBe(0)
        expect(parsed.steps).toBeGreaterThanOrEqual(STEPS_PER_BAR * 4)
        for (const v of [def.bass, def.kick, def.snare, def.hat, def.lead, def.arp]) {
          expect(tokens(v).length).toBe(parsed.steps)
        }
      })

      it('only uses pitches in the allowed spooky scale', () => {
        for (const v of [def.bass, def.lead, def.arp]) {
          for (const t of tokens(v)) {
            if (t === '.' || t === '_') continue
            const offset = (((noteToMidi(t) - A_PITCH_CLASS) % 12) + 12) % 12
            expect(ALLOWED_OFFSETS, `${def.id} ${t}`).toContain(offset)
          }
        }
      })

      it('has sane tempo, transposition and tiers', () => {
        expect(def.bpm).toBeGreaterThanOrEqual(60)
        expect(def.bpm).toBeLessThanOrEqual(160)
        expect(Number.isInteger(def.transpose)).toBe(true)
        expect(def.transpose).toBeGreaterThanOrEqual(-5)
        expect(def.transpose).toBeLessThanOrEqual(5)
        for (const t of [def.fixedTier, def.minTier]) {
          if (t !== undefined) { expect(t).toBeGreaterThanOrEqual(1); expect(t).toBeLessThanOrEqual(4) }
        }
      })

      it('every note fits inside the loop and stays in audible range', () => {
        parsed.stepEvents.forEach((e, i) => {
          for (const n of [e.bass, e.lead, e.arp]) {
            if (!n) continue
            expect(n.lenSteps).toBeGreaterThanOrEqual(1)
            expect(i + n.lenSteps).toBeLessThanOrEqual(parsed.steps)
            expect(n.midi + def.transpose).toBeGreaterThanOrEqual(28)
            expect(n.midi + def.transpose).toBeLessThanOrEqual(100)
          }
        })
      })

      it('has bass, drums and lead content', () => {
        const ev = parsed.stepEvents
        expect(ev.some(e => e.bass)).toBe(true)
        expect(ev.some(e => e.kick !== undefined)).toBe(true)
        expect(ev.some(e => e.snare !== undefined)).toBe(true)
        expect(ev.some(e => e.hat !== undefined)).toBe(true)
        expect(ev.some(e => e.lead)).toBe(true)
        expect(ev.some(e => e.arp)).toBe(true)
      })
    })
  }

  it('tracks differ from each other (distinct bpm or bass line)', () => {
    const keys = TRACKS.map(t => `${t.bpm}|${t.bass}|${t.lead}`)
    expect(new Set(keys).size).toBe(TRACKS.length)
  })

  it('the finale has its own bass and lead, distinct from every other track, and a floor of 2', () => {
    const f = getTrack('finale')
    expect(f.minTier).toBe(2)
    for (const t of TRACKS.filter((x) => x.id !== 'finale')) {
      expect(t.bass).not.toBe(f.bass)
      expect(t.lead).not.toBe(f.lead)
    }
  })

  it('title is fixed at tier 3 and boss has a floor of 2', () => {
    expect(getTrack('title').fixedTier).toBe(3)
    expect(getTrack('boss').minTier).toBe(2)
  })
})

describe('parseTrack errors', () => {
  it('computes note lengths from holds', () => {
    const t = parseTrack({ ...base, bass: 'A2 _ _ . A2 . . . . . . . . . . . ' + 'A2 ' + '. '.repeat(15) + '. '.repeat(32),
      kick: '. '.repeat(64), snare: '. '.repeat(64), hat: '. '.repeat(64), lead: '. '.repeat(64), arp: '. '.repeat(64) })
    expect(t.stepEvents[0].bass).toEqual({ midi: noteToMidi('A2'), lenSteps: 3 })
    expect(t.stepEvents[4].bass?.lenSteps).toBe(1)
  })
  it('rejects mismatched lengths', () => {
    expect(() => parseTrack({ ...base, hat: '. . . .' })).toThrow(/steps/)
  })
  it('rejects partial bars', () => {
    const s = '. '.repeat(15)
    expect(() => parseTrack({ ...base, bass: s, kick: s, snare: s, hat: s, lead: s, arp: s })).toThrow(/bars/)
  })
  it('rejects a hold with no note', () => {
    expect(() => parseTrack({ ...base, lead: '_ ' + base.lead })).toThrow(/hold/)
    expect(() => parseTrack({ ...base, lead: '. _ ' + base.lead.slice(4) })).toThrow(/hold/)
  })
  it('rejects bad drum tokens and note names', () => {
    expect(() => parseTrack({ ...base, kick: 'q ' + base.kick.slice(2) })).toThrow(/drum/)
    expect(() => parseTrack({ ...base, bass: 'Z9 ' + base.bass.slice(3) })).toThrow(/note/)
  })
})

describe('trackForStage', () => {
  it('maps stages and clamps', () => {
    expect(trackForStage(1)).toBe('stage1')
    expect(trackForStage(4)).toBe('stage4')
    expect(trackForStage(5)).toBe('boss')
    expect(trackForStage(6)).toBe('finale')
    expect(trackForStage(9)).toBe('finale')
    expect(trackForStage(0)).toBe('stage1')
    expect(trackForStage(NaN)).toBe('stage1')
  })
})
