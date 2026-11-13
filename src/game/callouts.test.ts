import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  selectCallout, makeCallout, addCallout, tickCallouts, calloutPose,
  CALLOUT_LIFE_MS, MAX_CALLOUTS, PRAISE,
} from './callouts'
import type { Callout } from './callouts'
import { comboForStreak } from './state'

const choice = { text: 'NICE!', kind: 'praise' as const }

describe('selectCallout', () => {
  it('combo x1 never shows a call-out', () => {
    for (let streak = 0; streak < 3; streak++) expect(selectCallout(1, 1, streak)).toBeNull()
  })

  it('tier-ups say x{N} COMBO!', () => {
    expect(selectCallout(1, 2, 3)).toEqual({ text: 'x2 COMBO!', kind: 'tierUp' })
    expect(selectCallout(2, 3, 6)).toEqual({ text: 'x3 COMBO!', kind: 'tierUp' })
    expect(selectCallout(3, 4, 10)).toEqual({ text: 'x4 COMBO!', kind: 'tierUp' })
  })

  it('praise per tier on even streaks: x2 NICE!, x3 GREAT!, x4 PERFECT!', () => {
    expect(selectCallout(2, 2, 4)).toEqual({ text: 'NICE!', kind: 'praise' })
    expect(selectCallout(3, 3, 8)).toEqual({ text: 'GREAT!', kind: 'praise' })
    expect(selectCallout(4, 4, 12)).toEqual({ text: 'PERFECT!', kind: 'praise' })
    expect(PRAISE).toEqual({ 2: 'NICE!', 3: 'GREAT!', 4: 'PERFECT!' })
  })

  it('odd streaks inside a tier show nothing', () => {
    expect(selectCallout(2, 2, 5)).toBeNull()
    expect(selectCallout(4, 4, 11)).toBeNull()
  })

  it('a tier-up wins over praise on the same hit', () => {
    expect(selectCallout(2, 3, 6)!.kind).toBe('tierUp')
  })

  it('matches the real streak → combo progression', () => {
    const seen: string[] = []
    let combo = 1
    for (let streak = 1; streak <= 14; streak++) {
      const next = comboForStreak(streak)
      const c = selectCallout(combo, next, streak)
      if (c) seen.push(`${streak}:${c.text}`)
      combo = next
    }
    expect(seen).toEqual([
      '3:x2 COMBO!', '4:NICE!', '6:x3 COMBO!', '8:GREAT!', '10:x4 COMBO!', '12:PERFECT!', '14:PERFECT!',
    ])
  })

  it('never throws and only returns known texts (property)', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 5 }), fc.integer({ min: 0, max: 60 }), (a, b, streak) => {
      const c = selectCallout(a, b, streak)
      if (c) expect(c.text === 'NICE!' || c.text === 'GREAT!' || c.text === 'PERFECT!' || /^x\d COMBO!$/.test(c.text)).toBe(true)
    }))
  })
})

describe('callout lifecycle', () => {
  it('is placed above the enemy and clamped inside the canvas', () => {
    const mid = makeCallout(500, 400, choice, 1000, 800)
    expect(mid.y).toBeLessThan(400)
    const edge = makeCallout(-50, -50, choice, 1000, 800)
    expect(edge.x).toBe(200)
    expect(edge.y).toBeGreaterThan(0)
    const far = makeCallout(5000, 5000, choice, 1000, 800)
    expect(far.x).toBe(800)
    expect(far.y).toBeLessThanOrEqual(720)
  })

  it('keeps at most 3, dropping the oldest', () => {
    let list: Callout[] = []
    for (let i = 0; i < MAX_CALLOUTS + 2; i++) list = addCallout(list, { ...makeCallout(500, 400, choice, 1000, 800), text: `c${i}` })
    expect(list.map((c) => c.text)).toEqual(['c2', 'c3', 'c4'])
  })

  it('expires after 900 ms of game time at any frame rate', () => {
    for (const hz of [30, 60, 144]) {
      let list = [makeCallout(500, 400, choice, 1000, 800)]
      const dt = 1000 / hz
      let t = 0
      while (list.length > 0 && t < 2000) { list = tickCallouts(list, dt); t += dt }
      expect(t).toBeGreaterThanOrEqual(CALLOUT_LIFE_MS)
      expect(t).toBeLessThan(CALLOUT_LIFE_MS + dt + 1e-6)
    }
  })

  it('pose: pops in with overshoot, rises, holds opaque, then fades to 0', () => {
    const c = makeCallout(500, 400, choice, 1000, 800)
    expect(calloutPose(c).scale).toBeCloseTo(0, 9)
    const peak = Math.max(...[30, 60, 90, 120].map((ageMs) => calloutPose({ ...c, ageMs }).scale))
    expect(peak).toBeGreaterThan(1)
    expect(calloutPose({ ...c, ageMs: 200 }).scale).toBeCloseTo(1, 9)
    expect(calloutPose({ ...c, ageMs: 400 }).alpha).toBe(1)
    expect(calloutPose({ ...c, ageMs: 400 }).dy).toBeLessThan(0)
    expect(calloutPose({ ...c, ageMs: CALLOUT_LIFE_MS }).alpha).toBeCloseTo(0, 9)
    const alphas = [540, 650, 760, 870].map((ageMs) => calloutPose({ ...c, ageMs }).alpha)
    expect([...alphas].sort((a, b) => b - a)).toEqual(alphas)
  })
})
