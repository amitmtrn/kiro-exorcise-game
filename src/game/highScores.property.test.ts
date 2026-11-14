import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { insertScore, parseTable, serializeTable, sanitizeName, isValidName, isValidEntry, generateName, TABLE_SIZE, ENTRY_KEYS } from './highScores'
import type { ScoreEntry } from './highScores'
import { mulberry32 } from '../test/prng'

const entryArb = (i: number) => fc.record({
  score: fc.integer({ min: 1, max: 100_000 }),
  stage: fc.integer({ min: 1, max: 6 }),
  mode: fc.constantFrom<'1P' | '2P'>('1P', '2P'),
  name: fc.string({ minLength: 1, maxLength: 12 }).map(sanitizeName).filter((n) => n.length > 0),
}).map((r): ScoreEntry => ({ ...r, id: 'e' + i, date: '2025-10-31' }))
const listArb = fc.integer({ min: 0, max: 30 }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => entryArb(i))))

describe('high-score table invariants', () => {
  it('after any insert sequence: at most 10, sorted descending, every entry valid, no duplicate ids', () => {
    fc.assert(fc.property(listArb, (entries) => {
      let t: ScoreEntry[] = []
      for (const e of entries) t = insertScore(t, e).table
      expect(t.length).toBeLessThanOrEqual(TABLE_SIZE)
      for (let i = 1; i < t.length; i++) expect(t[i - 1].score).toBeGreaterThanOrEqual(t[i].score)
      for (const e of t) expect(isValidEntry(e)).toBe(true)
      expect(new Set(t.map((e) => e.id)).size).toBe(t.length)
      // the table holds the 10 best scores of everything inserted
      const best = [...entries].map((e) => e.score).sort((a, b) => b - a).slice(0, TABLE_SIZE)
      expect(t.map((e) => e.score)).toEqual(best)
    }), { numRuns: 200 })
  })
  it('serialise → parse is the identity and parse is idempotent', () => {
    fc.assert(fc.property(listArb, (entries) => {
      let t: ScoreEntry[] = []
      for (const e of entries) t = insertScore(t, e).table
      const j = serializeTable(t)
      expect(parseTable(j)).toEqual(t)
      expect(serializeTable(parseTable(j))).toBe(j)
    }), { numRuns: 200 })
  })
  it('stored JSON holds only the allowed keys (no images, no camera data)', () => {
    fc.assert(fc.property(listArb, fc.dictionary(fc.string(), fc.jsonValue()), (entries, junk) => {
      const dirty = entries.map((e) => ({ ...junk, ...e }))
      const t = parseTable(JSON.stringify(dirty))
      for (const e of JSON.parse(serializeTable(t)) as object[]) expect(Object.keys(e).sort()).toEqual([...ENTRY_KEYS].sort())
    }), { numRuns: 100 })
  })
  it('parse never throws on arbitrary input', () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.jsonValue().map((v) => JSON.stringify(v))), (s) => {
      expect(() => parseTable(s)).not.toThrow()
      expect(parseTable(s).length).toBeLessThanOrEqual(TABLE_SIZE)
    }), { numRuns: 300 })
  })
  it('sanitizeName always gives a valid name or empty; generated names are valid', () => {
    fc.assert(fc.property(fc.string(), fc.integer(), (s, seed) => {
      const n = sanitizeName(s)
      expect(n === '' || isValidName(n)).toBe(true)
      expect(isValidName(generateName(mulberry32(seed)))).toBe(true)
    }), { numRuns: 300 })
  })
})
