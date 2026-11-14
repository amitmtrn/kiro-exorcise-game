import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { newNameEntry, pickStep, confirm, nameKey, tickNameEntry, finalName, PICK_LEN, IDLE_ACCEPT_MS, ACTIVE_ACCEPT_MS } from './nameEntry'
import type { NameEntry } from './nameEntry'
import { isValidName, generateName } from './highScores'
import { mulberry32 } from '../test/prng'

const action = fc.oneof(
  fc.constant<['prev']>(['prev']), fc.constant<['next']>(['next']), fc.constant<['ok']>(['ok']),
  fc.string({ maxLength: 2 }).map((k) => ['key', k] as ['key', string]),
  fc.constantFrom('Enter', 'Backspace', 'Escape', 'ArrowLeft').map((k) => ['key', k] as ['key', string]),
)

function apply(e: NameEntry, a: ['prev'] | ['next'] | ['ok'] | ['key', string], now: number): NameEntry {
  if (a[0] === 'prev') return pickStep(e, -1, now)
  if (a[0] === 'next') return pickStep(e, 1, now)
  if (a[0] === 'ok') return confirm(e, now)
  return nameKey(e, a[1], now) ?? e
}

describe('name entry properties', () => {
  it('any input sequence keeps a valid final name, the cursor on a letter and at most 8 characters', () => {
    fc.assert(fc.property(fc.integer(), fc.array(action, { maxLength: 60 }), (seed, acts) => {
      let e = newNameEntry(generateName(mulberry32(seed)), 0)
      let t = 0
      for (const a of acts) {
        e = apply(e, a, (t += 100))
        expect(e.cursor).toBeGreaterThanOrEqual(0)
        expect(e.cursor).toBeLessThan(Math.max(PICK_LEN, e.text.length))
        expect(e.text.length).toBeLessThanOrEqual(8)
        expect(isValidName(finalName(e))).toBe(true)
      }
    }), { numRuns: 300 })
  })
  it('a finished entry never changes again', () => {
    fc.assert(fc.property(fc.array(action, { maxLength: 30 }), (acts) => {
      const done = confirm(newNameEntry('BOO-01', 0), 0)
      let e = done
      for (const a of acts) e = apply(e, a, 1)
      expect(e).toEqual(done)
    }))
  })
  it('the screen always ends: by the idle or active timeout at the latest', () => {
    fc.assert(fc.property(fc.array(action, { maxLength: 20 }), fc.integer({ min: 1, max: 2000 }), (acts, gap) => {
      let e = newNameEntry('BOO-01', 0)
      let t = 0
      for (const a of acts) e = tickNameEntry(apply(e, a, (t += gap)), t)
      const end = Math.max(IDLE_ACCEPT_MS, t + ACTIVE_ACCEPT_MS)
      expect(tickNameEntry(e, end).done).toBe(true)
    }))
  })
  it('one OK press always finishes naming with a valid name, after any steps', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom<-1 | 1>(-1, 1), { maxLength: 10 }), fc.array(fc.integer({ min: 0, max: 3000 }), { maxLength: 4 }), (steps, waits) => {
      let e = newNameEntry('BOO-01', 0)
      let t = 0
      steps.forEach((d, i) => { e = tickNameEntry(pickStep(e, d, (t += waits[i % Math.max(1, waits.length)] ?? 0)), t) })
      e = confirm(e, t + 1)
      expect(e.done).toBe(true)
      expect(isValidName(finalName(e))).toBe(true)
    }))
  })
  it('stepping never changes the length of the name and the cursor stays inside it', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom<-1 | 1>(-1, 1), { minLength: 1, maxLength: 30 }), (steps) => {
      let e = newNameEntry('GHOST-7F', 0)
      let t = 0
      for (const d of steps) { e = tickNameEntry(pickStep(e, d, (t += 1700)), t) ; expect(e.text).toHaveLength(8); expect(e.cursor).toBeLessThan(PICK_LEN) }
    }))
  })
})
